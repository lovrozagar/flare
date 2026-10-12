import { expect, it, vi } from "vitest";
import type { DevErrorPayload } from "../../shared/errors/dev-report.ts";
import { UnauthenticatedError, UnauthorizedError } from "../../shared/errors/http.ts";
import type { Caller } from "../auth/caller.ts";
import { withServerContext } from "../context/ctx.ts";
import type { StageResult } from "../lifecycle/finalize.ts";
import type { Logger } from "../lifecycle/logger.ts";
import type { ErrorSink } from "../render/projector.ts";
import { createServerFn, type ServerFn } from "./builder.ts";
import { InputError, dispatch } from "./dispatch.ts";

function noop(): void {}

const quiet: Logger = { level: "error", error: noop, warn: noop, log: noop };

type Scope = {
	authenticate?: (ctx: { request: Request; env: unknown } & Caller) => unknown;
	env?: unknown;
	serverContext?: () => unknown;
	lookup?: (id: string) => void;
	sink?: ErrorSink;
	bodyLimit?: number;
};

type Answer = { status: number; headers: Headers; body: string };

function named(name: string, method: "get" | "post" = "post") {
	return { method, __id: `${name}-id`, __name: name };
}

function post(fn: { id: string }, input: unknown, headers: Record<string, string> = {}): Request {
	return new Request(`http://localhost/_flare/fn/${fn.id}`, {
		method: "POST",
		body: JSON.stringify(input),
		headers: { origin: "http://localhost", "content-type": "application/json", ...headers },
	});
}

async function send(fns: readonly ServerFn[], request: Request, scope: Scope = {}): Promise<Answer> {
	const serverFns = Object.fromEntries(
		fns.map((fn) => [
			fn.id,
			async () => {
				scope.lookup?.(fn.id);
				return fn;
			},
		]),
	);
	const sink = scope.sink ?? { dev: false, log: quiet };
	const result = await withServerContext(
		{ request, env: scope.env ?? {}, serverContext: scope.serverContext, authenticate: scope.authenticate },
		() => dispatch({ request, serverFns, sameSite: [], sink, basePath: "/", bodyLimit: scope.bodyLimit }),
		(): StageResult => ({ status: 500, body: null }),
	);
	const headers = result.headers ?? new Headers();
	return { status: result.status, headers, body: await new Response(result.body).text() };
}

const echo = createServerFn(named("echo")).handler(({ input }) => ({ input }));

const rejects = { "~standard": { validate: () => ({ issues: [{ message: "bad", path: ["n"] }] }) } };

const failed = { issues: [{ message: "bad", path: ["n"] }], fieldErrors: { n: ["bad"] } };

// Runs `call` inside an active request, as a loader would.
function within(authenticate: () => unknown, call: () => unknown): Promise<unknown> {
	const request = new Request("http://localhost/");
	return withServerContext(
		{ request, env: {}, authenticate },
		async () => call(),
		() => undefined,
	);
}

it("unknown id", async () => {
	const missing = { id: "0123456789abcdef" };
	expect((await send([echo], post(missing, 1))).status).toBe(404);
	const options = new Request(`http://localhost/_flare/fn/${missing.id}`, { method: "OPTIONS" });
	expect((await send([echo], options)).status).toBe(404);
	expect((await send([echo], post({ id: "constructor" }, 1))).status).toBe(404);
});

it("OPTIONS", async () => {
	const answer = await send([echo], new Request(`http://localhost/_flare/fn/${echo.id}`, { method: "OPTIONS" }));
	expect(answer.status).toBe(204);
	expect(answer.headers.get("allow")).toBe("POST, OPTIONS");
	expect(answer.body).toBe("");
});

it("wrong method", async () => {
	const answer = await send([echo], new Request(`http://localhost/_flare/fn/${echo.id}`));
	expect(answer.status).toBe(405);
	expect(answer.headers.get("allow")).toBe("POST, OPTIONS");
	const read = createServerFn(named("read", "get")).handler(() => null);
	const posted = await send([read], post(read, 1));
	expect(posted.headers.get("allow")).toBe("GET, OPTIONS");
});

it("order", async () => {
	const seen: string[] = [];
	const guarded = createServerFn(named("guarded"))
		.authenticate()
		.input((raw) => {
			seen.push("input");
			return raw;
		})
		.authorize(() => {
			seen.push("authorize");
			return true;
		})
		.handler(() => {
			seen.push("handler");
			return "done";
		});
	const scope: Scope = {
		lookup: () => seen.push("lookup"),
		authenticate: () => {
			seen.push("authenticate");
			return { id: "ada" };
		},
	};
	const answer = await send([guarded], post(guarded, 1), scope);
	expect(JSON.parse(answer.body)).toEqual({ name: "guarded", status: 200, data: "done" });
	expect(seen).toEqual(["lookup", "authenticate", "input", "authorize", "handler"]);
	// Each stage answers before the next one runs.
	seen.length = 0;
	const foreign = { origin: "https://evil.example" };
	const unknown = { id: "fedcba9876543210" };
	expect((await send([guarded], post(unknown, 1, foreign), scope)).status).toBe(404);
	const getForeign = new Request(`http://localhost/_flare/fn/${guarded.id}`, { headers: foreign });
	expect((await send([guarded], getForeign, scope)).status).toBe(405);
	expect((await send([guarded], post(guarded, 1, foreign), scope)).status).toBe(403);
	expect(seen).toEqual(["lookup", "lookup"]);
	seen.length = 0;
	const anonymous = await send([guarded], post(guarded, 1), { ...scope, authenticate: () => null });
	expect(anonymous.status).toBe(401);
	expect(seen).toEqual(["lookup"]);
	const broken = await send([guarded], post(guarded, 1), { authenticate: () => undefined });
	expect(broken.status).toBe(500);
	// Input answers before authorize, and the body cap before the validator.
	const checked = createServerFn(named("checked"))
		.input(rejects)
		.authorize(() => {
			seen.push("authorize");
			return true;
		})
		.handler(() => "never");
	seen.length = 0;
	const invalid = await send([checked], post(checked, 1));
	expect(invalid.status).toBe(400);
	expect(JSON.parse(invalid.body)).toEqual({ name: "checked", status: 400, message: "Invalid input", errors: failed });
	expect((await send([checked], post(checked, "long"), { bodyLimit: 2 })).status).toBe(413);
	expect(seen).toEqual([]);
});

it("forbidden", async () => {
	const handler = vi.fn<() => string>(() => "secret");
	const denied = createServerFn(named("denied"))
		.authorize(() => false)
		.handler(handler);
	const overlay = vi.fn<(payload: DevErrorPayload) => void>();
	const answer = await send([denied], post(denied, 1), { sink: { dev: true, send: overlay, log: quiet } });
	expect(answer.status).toBe(403);
	expect(answer.headers.get("content-type")).toMatch(/^application\/json/);
	expect(JSON.parse(answer.body)).toEqual({ name: "denied", status: 403, message: "Forbidden" });
	expect(handler).not.toHaveBeenCalled();
	expect(overlay).not.toHaveBeenCalled();
});

it("in request", async () => {
	const seen: unknown[] = [];
	const inner = createServerFn(named("inner"))
		.authenticate()
		.input((raw) => ({ doubled: Number(raw) * 2 }))
		.handler((ctx) => {
			seen.push(ctx);
			return ctx.input;
		});
	const outer = createServerFn(named("outer"))
		.authenticate()
		.handler(async () => inner(2));
	const session = { id: "ada" };
	const authenticate = vi.fn<() => unknown>(() => session);
	const request = post(outer, null);
	const env = { region: "eu" };
	const context = { tenant: "t" };
	const answer = await send([outer], request, { authenticate, env, serverContext: () => context });
	expect(JSON.parse(answer.body)).toEqual({ name: "outer", status: 200, data: { doubled: 4 } });
	expect(seen).toEqual([{ input: { doubled: 4 }, auth: session, env, request, serverContext: context }]);
	expect(authenticate).toHaveBeenCalledOnce();
	// In-process, each failure is thrown as it is, unprojected.
	const plain = createServerFn(named("plain")).handler(({ input }) => input);
	expect(
		await within(
			() => null,
			() => plain("ignored"),
		),
	).toBeUndefined();
	await expect(
		within(
			() => null,
			() => inner(1),
		),
	).rejects.toBeInstanceOf(UnauthenticatedError);
	await expect(
		within(
			() => undefined,
			() => inner(1),
		),
	).rejects.toThrow(/returned undefined/);
	const checked = createServerFn(named("checked"))
		.input(rejects)
		.handler(() => "never");
	const invalid = await within(
		() => null,
		() => checked(1),
	).catch((error: unknown) => error);
	expect(invalid).toBeInstanceOf(InputError);
	expect(invalid).toMatchObject({ status: 400, message: "Invalid input", ...failed });
	const denied = createServerFn(named("denied"))
		.authorize(() => false)
		.handler(() => "never");
	await expect(
		within(
			() => null,
			() => denied(1),
		),
	).rejects.toBeInstanceOf(UnauthorizedError);
});

it("no request", async () => {
	const lone = createServerFn(named("lone")).handler(() => "never");
	await expect(lone(1)).rejects.toThrow("server function called outside a request");
});
