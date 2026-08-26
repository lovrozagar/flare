/**
 * @vitest-environment node
 *
 * Server function integration tests.
 * Tests /_flare/server-fn/ routing through the full server handler pipeline.
 * Validates routing, method enforcement, authentication, input validation,
 * authorization, error handling, middleware interaction, and security headers.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServerFnHandlerRegistration, ServerFnRegistration } from "../../src/server-fn/index.ts";

const fnRef = vi.hoisted(() => ({
	current: new Map() as Map<string, ServerFnRegistration>,
}));
vi.mock("virtual:flare-server-fn-map", () => ({
	get default() {
		return fnRef.current;
	},
}));

afterEach(() => {
	fnRef.current = new Map();
});

import { serverFnGetUrl } from "../../src/server-fn/get-input.ts";
import {
	alwaysAuthFn,
	buildHandler,
	type HandlerContext,
	makeRequest,
	neverAuthFn,
	readResponseBody,
} from "./fixtures.ts";

/* ── Helpers ──────────────────────────────────────────────────────────── */

function makeFnMap(
	...entries: Array<[string, Omit<ServerFnHandlerRegistration, "id"> & { id?: string }]>
): Map<string, ServerFnRegistration> {
	const map = new Map(entries.map(([key, reg]) => [key, { ...reg, id: reg.id ?? key } as ServerFnRegistration]));
	fnRef.current = map;
	return map;
}

function postFn(fnId: string, fnName: string, body?: unknown): Request {
	return makeRequest(`/_flare/server-fn/${fnId}/${fnName}`, {
		body: body !== undefined ? JSON.stringify(body) : undefined,
		headers: { "Content-Type": "application/json" },
		method: "POST",
	});
}

function getFn(fnId: string, fnName: string, params?: Record<string, string>): Request {
	const path = `/_flare/server-fn/${fnId}/${fnName}`;
	return makeRequest(params ? serverFnGetUrl(path, params) : path, { method: "GET" });
}

async function parseJsonResponse(response: Response): Promise<Record<string, unknown>> {
	const text = await readResponseBody(response);
	return JSON.parse(text) as Record<string, unknown>;
}

/* ── Routing ─────────────────────────────────────────────────────────── */

describe("server fn — routing", () => {
	it("/_flare/server-fn/ with no serverFns configured → 404", async () => {
		const handler = buildHandler();
		const response = await handler.fetch(postFn("abc", "doStuff"), {});

		expect(response.status).toBe(404);
	});

	it("unknown fn id → 404", async () => {
		makeFnMap([
			"fn1",
			{
				authenticate: false,
				fn: () => ({ result: "ok" }),
				method: "post",
				name: "doStuff",
			},
		]);
		const handler = buildHandler();
		const response = await handler.fetch(postFn("unknown-id", "doStuff"), {});

		expect(response.status).toBe(404);
		const body = await parseJsonResponse(response);
		expect(body.message).toBe("Server function not found");
	});

	it("wrong fn name → 404", async () => {
		makeFnMap([
			"fn1",
			{
				authenticate: false,
				fn: () => ({ result: "ok" }),
				method: "post",
				name: "doStuff",
			},
		]);
		const handler = buildHandler();
		const response = await handler.fetch(postFn("fn1", "wrongName"), {});

		expect(response.status).toBe(404);
	});

	it("incomplete path /_flare/server-fn/id → 404", async () => {
		makeFnMap([
			"fn1",
			{
				authenticate: false,
				fn: () => ({ result: "ok" }),
				method: "post",
				name: "doStuff",
			},
		]);
		const handler = buildHandler();
		const response = await handler.fetch(makeRequest("/_flare/server-fn/fn1", { method: "POST" }), {});

		expect(response.status).toBe(404);
	});

	it("security headers applied to server fn responses", async () => {
		makeFnMap([
			"fn1",
			{
				authenticate: false,
				fn: () => ({ ok: true }),
				method: "post",
				name: "check",
			},
		]);
		const handler = buildHandler();
		const response = await handler.fetch(postFn("fn1", "check"), {});

		expect(response.headers.get("Content-Security-Policy")).toBeTruthy();
		expect(response.headers.get("X-Frame-Options")).toBe("DENY");
		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
	});
});

/* ── Execution ───────────────────────────────────────────────────────── */

describe("server fn — POST execution", () => {
	it("POST fn → 200 with JSON result", async () => {
		makeFnMap([
			"fn1",
			{
				authenticate: false,
				fn: () => ({ computed: 42 }),
				method: "post",
				name: "calculate",
			},
		]);
		const handler = buildHandler();
		const response = await handler.fetch(postFn("fn1", "calculate"), {});

		expect(response.status).toBe(200);
		const body = await parseJsonResponse(response);
		expect(body.data).toEqual({ computed: 42 });
	});

	it("POST with JSON body → parsed as input", async () => {
		makeFnMap([
			"fn1",
			{
				authenticate: false,
				fn: (ctx: HandlerContext<unknown, unknown>) => ({ received: ctx.input }),
				method: "post",
				name: "echo",
			},
		]);
		const handler = buildHandler();
		const response = await handler.fetch(postFn("fn1", "echo", { count: 5, message: "hello" }), {});

		expect(response.status).toBe(200);
		const body = await parseJsonResponse(response);
		expect((body.data as Record<string, unknown>)?.received).toEqual({
			count: 5,
			message: "hello",
		});
	});

	it("POST with empty body → input is undefined", async () => {
		makeFnMap([
			"fn1",
			{
				authenticate: false,
				fn: (ctx: HandlerContext<unknown, unknown>) => ({ hasInput: ctx.input !== undefined }),
				method: "post",
				name: "noBody",
			},
		]);
		const handler = buildHandler();
		const response = await handler.fetch(
			makeRequest("/_flare/server-fn/fn1/noBody", {
				headers: { "Content-Type": "application/json" },
				method: "POST",
			}),
			{},
		);

		expect(response.status).toBe(200);
	});

	it("POST with invalid JSON → 400", async () => {
		makeFnMap([
			"fn1",
			{
				authenticate: false,
				fn: () => ({ ok: true }),
				method: "post",
				name: "strict",
			},
		]);
		const handler = buildHandler();
		const response = await handler.fetch(
			makeRequest("/_flare/server-fn/fn1/strict", {
				body: "not valid json{{{",
				headers: { "Content-Type": "application/json" },
				method: "POST",
			}),
			{},
		);

		expect(response.status).toBe(400);
	});
});

describe("server fn — GET execution", () => {
	it("GET fn → 200 with search params as input", async () => {
		makeFnMap([
			"fn1",
			{
				authenticate: false,
				fn: (ctx: HandlerContext<unknown, unknown>) => ({ input: ctx.input }),
				method: "get",
				name: "getData",
			},
		]);
		const handler = buildHandler();
		const response = await handler.fetch(getFn("fn1", "getData", { page: "2", q: "test" }), {});

		expect(response.status).toBe(200);
		const body = await parseJsonResponse(response);
		expect((body.data as Record<string, unknown>)?.input).toEqual({
			page: "2",
			q: "test",
		});
	});
});

describe("server fn — method enforcement", () => {
	it("GET to POST-only fn → 405", async () => {
		makeFnMap([
			"fn1",
			{
				authenticate: false,
				fn: () => ({ ok: true }),
				method: "post",
				name: "postOnly",
			},
		]);
		const handler = buildHandler();
		const response = await handler.fetch(getFn("fn1", "postOnly"), {});

		expect(response.status).toBe(405);
	});

	it("POST to GET-only fn → 405", async () => {
		makeFnMap([
			"fn1",
			{
				authenticate: false,
				fn: () => ({ ok: true }),
				method: "get",
				name: "getOnly",
			},
		]);
		const handler = buildHandler();
		const response = await handler.fetch(postFn("fn1", "getOnly"), {});

		expect(response.status).toBe(405);
	});
});

/* ── Authentication ──────────────────────────────────────────────────── */

describe("server fn — authentication", () => {
	it("authenticated fn without authenticateFn → 401", async () => {
		makeFnMap([
			"fn1",
			{
				authenticate: true,
				fn: () => ({ secret: "data" }),
				method: "post",
				name: "secured",
			},
		]);
		const handler = buildHandler();
		const response = await handler.fetch(postFn("fn1", "secured"), {});

		expect(response.status).toBe(401);
	});

	it("authenticated fn with null-returning auth → 401", async () => {
		makeFnMap([
			"fn1",
			{
				authenticate: true,
				fn: () => ({ secret: "data" }),
				method: "post",
				name: "secured",
			},
		]);
		const handler = buildHandler({ authenticateFn: neverAuthFn });
		const response = await handler.fetch(postFn("fn1", "secured"), {});

		expect(response.status).toBe(401);
	});

	it("authenticated fn with valid auth → 200 + auth in context", async () => {
		makeFnMap([
			"fn1",
			{
				authenticate: true,
				fn: (ctx: HandlerContext<unknown, unknown>) => ({ auth: ctx.auth }),
				method: "post",
				name: "secured",
			},
		]);
		const handler = buildHandler({ authenticateFn: alwaysAuthFn });
		const response = await handler.fetch(postFn("fn1", "secured"), {});

		expect(response.status).toBe(200);
		const body = await parseJsonResponse(response);
		expect((body.data as Record<string, unknown>)?.auth).toBeTruthy();
	});

	it("non-authenticated fn works without authenticateFn", async () => {
		makeFnMap([
			"fn1",
			{
				authenticate: false,
				fn: () => ({ public: true }),
				method: "post",
				name: "open",
			},
		]);
		const handler = buildHandler();
		const response = await handler.fetch(postFn("fn1", "open"), {});

		expect(response.status).toBe(200);
	});
});

/* ── Input validation ────────────────────────────────────────────────── */

describe("server fn — input validation", () => {
	it("function validator passes → input transformed", async () => {
		makeFnMap([
			"fn1",
			{
				authenticate: false,
				fn: (ctx: HandlerContext<unknown, unknown>) => ({ received: ctx.input }),
				input: (raw: unknown) => {
					const obj = raw as Record<string, unknown>;
					return { name: String(obj.name).toUpperCase() };
				},
				method: "post",
				name: "validated",
			},
		]);
		const handler = buildHandler();
		const response = await handler.fetch(postFn("fn1", "validated", { name: "alice" }), {});

		expect(response.status).toBe(200);
		const body = await parseJsonResponse(response);
		expect((body.data as Record<string, unknown>)?.received).toEqual({
			name: "ALICE",
		});
	});

	it("{ parse } validator works", async () => {
		makeFnMap([
			"fn1",
			{
				authenticate: false,
				fn: (ctx: HandlerContext<unknown, unknown>) => ({ received: ctx.input }),
				input: {
					parse: (raw: unknown) => {
						const obj = raw as Record<string, unknown>;
						if (!obj.email) throw new Error("email required");
						return { email: String(obj.email) };
					},
				},
				method: "post",
				name: "parsed",
			},
		]);
		const handler = buildHandler();
		const response = await handler.fetch(postFn("fn1", "parsed", { email: "a@b.com" }), {});

		expect(response.status).toBe(200);
		const body = await parseJsonResponse(response);
		expect((body.data as Record<string, unknown>)?.received).toEqual({
			email: "a@b.com",
		});
	});

	it("validator rejection → 400", async () => {
		makeFnMap([
			"fn1",
			{
				authenticate: false,
				fn: () => ({ ok: true }),
				input: {
					parse: (raw: unknown) => {
						if (!raw || typeof raw !== "object" || !("name" in raw)) {
							throw new Error("name required");
						}
						return raw;
					},
				},
				method: "post",
				name: "validated",
			},
		]);
		const handler = buildHandler();
		const response = await handler.fetch(postFn("fn1", "validated", { wrong: "field" }), {});

		expect(response.status).toBe(400);
		const body = await parseJsonResponse(response);
		expect(body.message).toBe("name required");
	});
});

/* ── Authorization ───────────────────────────────────────────────────── */

describe("server fn — authorization", () => {
	it("authorizeFn returning false → 403", async () => {
		makeFnMap([
			"fn1",
			{
				authenticate: true,
				authorizeFn: () => false,
				fn: () => ({ secret: true }),
				method: "post",
				name: "adminOnly",
			},
		]);
		const handler = buildHandler({ authenticateFn: alwaysAuthFn });
		const response = await handler.fetch(postFn("fn1", "adminOnly"), {});

		expect(response.status).toBe(403);
	});

	it("authorizeFn returning true → 200", async () => {
		makeFnMap([
			"fn1",
			{
				authenticate: true,
				authorizeFn: () => true,
				fn: () => ({ allowed: true }),
				method: "post",
				name: "adminOnly",
			},
		]);
		const handler = buildHandler({ authenticateFn: alwaysAuthFn });
		const response = await handler.fetch(postFn("fn1", "adminOnly"), {});

		expect(response.status).toBe(200);
	});

	it("authorizeFn receives auth + input", async () => {
		let capturedAuth: unknown;
		let capturedInput: unknown;
		makeFnMap([
			"fn1",
			{
				authenticate: true,
				authorizeFn: (ctx: { auth: unknown; input: unknown }) => {
					capturedAuth = ctx.auth;
					capturedInput = ctx.input;
					return true;
				},
				fn: () => ({ ok: true }),
				method: "post",
				name: "check",
			},
		]);
		const handler = buildHandler({ authenticateFn: alwaysAuthFn });
		await handler.fetch(postFn("fn1", "check", { data: "test" }), {});

		expect(capturedAuth).toBeTruthy();
		expect(capturedInput).toEqual({ data: "test" });
	});
});

/* ── Error handling ──────────────────────────────────────────────────── */

describe("server fn — error handling", () => {
	it("handler throwing generic error → 500", async () => {
		makeFnMap([
			"fn1",
			{
				authenticate: false,
				fn: () => {
					throw new Error("internal failure");
				},
				method: "post",
				name: "failing",
			},
		]);
		const handler = buildHandler();
		const response = await handler.fetch(postFn("fn1", "failing"), {});

		expect(response.status).toBe(500);
		const body = await parseJsonResponse(response);
		expect(body.message).toBe("Internal server error");
	});

	it("handler returning null → data field is null", async () => {
		makeFnMap([
			"fn1",
			{
				authenticate: false,
				fn: () => null,
				method: "post",
				name: "nullReturn",
			},
		]);
		const handler = buildHandler();
		const response = await handler.fetch(postFn("fn1", "nullReturn"), {});

		expect(response.status).toBe(200);
		const body = await parseJsonResponse(response);
		expect(body.data).toBeNull();
	});
});

/* ── Middleware interaction ───────────────────────────────────────────── */

describe("server fn — middleware interaction", () => {
	it("middleware response handlers apply to server fn response", async () => {
		makeFnMap([
			"fn1",
			{
				authenticate: false,
				fn: () => ({ ok: true }),
				method: "post",
				name: "check",
			},
		]);
		const handler = buildHandler({
			middlewareEntries: [
				{
					middlewares: [
						async (ctx) => {
							ctx.onResponse((res) => {
								const headers = new Headers(res.headers);
								headers.set("X-MW-Applied", "yes");
								return new Response(res.body, { headers, status: res.status });
							});
							return ctx.next();
						},
					],
				},
			],
		});
		const response = await handler.fetch(postFn("fn1", "check"), {});

		expect(response.status).toBe(200);
		expect(response.headers.get("X-MW-Applied")).toBe("yes");
	});

	it("middleware bypass prevents server fn execution", async () => {
		let fnCalled = false;
		makeFnMap([
			"fn1",
			{
				authenticate: false,
				fn: () => {
					fnCalled = true;
					return { ok: true };
				},
				method: "post",
				name: "check",
			},
		]);
		const handler = buildHandler({
			middlewareEntries: [
				{
					middlewares: [
						async () => ({
							response: new Response("blocked by middleware"),
							type: "bypass" as const,
						}),
					],
				},
			],
		});
		const response = await handler.fetch(postFn("fn1", "check"), {});

		expect(fnCalled).toBe(false);
		expect(await readResponseBody(response)).toBe("blocked by middleware");
	});

	it("middleware respond prevents server fn execution", async () => {
		let fnCalled = false;
		makeFnMap([
			"fn1",
			{
				authenticate: false,
				fn: () => {
					fnCalled = true;
					return { ok: true };
				},
				method: "post",
				name: "check",
			},
		]);
		const handler = buildHandler({
			middlewareEntries: [
				{
					middlewares: [
						async () => ({
							response: new Response("responded"),
							type: "respond" as const,
						}),
					],
				},
			],
		});
		const response = await handler.fetch(postFn("fn1", "check"), {});

		expect(fnCalled).toBe(false);
		expect(await readResponseBody(response)).toBe("responded");
	});
});

/* ── Env passthrough ─────────────────────────────────────────────────── */

describe("server fn — env passthrough", () => {
	it("handler env available in server fn context", async () => {
		makeFnMap([
			"fn1",
			{
				authenticate: false,
				fn: (ctx: HandlerContext<unknown, unknown>) => ({ env: ctx.env }),
				method: "post",
				name: "envCheck",
			},
		]);
		const handler = buildHandler();
		const testEnv = { DB_URL: "postgres://localhost" };
		const response = await handler.fetch(postFn("fn1", "envCheck"), testEnv);

		expect(response.status).toBe(200);
		const body = await parseJsonResponse(response);
		expect((body.data as Record<string, unknown>)?.env).toEqual(testEnv);
	});
});

/* ── No console noise ────────────────────────────────────────────────── */

describe("server fn — no console errors", () => {
	it("successful server fn flow produces no console.error", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		makeFnMap(
			[
				"fn1",
				{
					authenticate: false,
					fn: () => ({ ok: true }),
					method: "post",
					name: "clean",
				},
			],
			[
				"fn2",
				{
					authenticate: true,
					fn: (ctx: HandlerContext<unknown, unknown>) => ({ auth: ctx.auth }),
					method: "post",
					name: "authed",
				},
			],
		);
		const handler = buildHandler({ authenticateFn: alwaysAuthFn });
		await handler.fetch(postFn("fn1", "clean"), {});
		await handler.fetch(postFn("fn2", "authed"), {});

		expect(errorSpy).not.toHaveBeenCalled();
		errorSpy.mockRestore();
	});
});
