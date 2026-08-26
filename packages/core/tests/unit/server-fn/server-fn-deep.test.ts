/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest";
import { ServerFnValidationError, UnauthenticatedError, UnauthorizedError } from "../../../src/errors/index.ts";
import { runWithServerContext } from "../../../src/server-context/index.ts";
import type {
	ServerFnHandlerRegistration,
	ServerFnRegistration,
	ServerFnStreamRegistration,
} from "../../../src/server-fn/index.ts";
import { serializeGetInput } from "../../../src/server-fn/get-input.ts";
import { createServerFn, handleServerFnRequest } from "../../../src/server-fn/index.ts";
import type { FlareStore } from "../../../src/store/index.ts";

/* ── Helpers ───────────────────────────────────────────────────────── */

function makeFlareStore(overrides?: Partial<FlareStore>): FlareStore {
	return {
		delete: vi.fn(async () => {}),
		deleteByTags: vi.fn(async () => {}),
		get: vi.fn(async () => null),
		set: vi.fn(async () => {}),
		...overrides,
	};
}

function makeReg(overrides?: Partial<ServerFnHandlerRegistration>): ServerFnRegistration {
	return {
		authenticate: false,
		fn: async (ctx) => ctx.input,
		id: "test",
		method: "post",
		name: "test",
		...overrides,
	} as ServerFnRegistration;
}

function makeFns(...entries: Array<[string, Partial<ServerFnHandlerRegistration>]>): Map<string, ServerFnRegistration> {
	const map = new Map<string, ServerFnRegistration>();
	for (const [id, reg] of entries) {
		map.set(id, makeReg({ ...reg }));
	}
	return map;
}

function makeStreamReg(overrides?: Partial<ServerFnStreamRegistration>): ServerFnRegistration {
	return {
		authenticate: false,
		fn: async function* () {
			yield "default";
		},
		id: "test",
		method: "post",
		name: "test",
		stream: true,
		...overrides,
	} as ServerFnRegistration;
}

function makeStreamFns(
	...entries: Array<[string, Partial<ServerFnStreamRegistration>]>
): Map<string, ServerFnRegistration> {
	const map = new Map<string, ServerFnRegistration>();
	for (const [id, reg] of entries) {
		map.set(id, makeStreamReg({ ...reg }));
	}
	return map;
}

function postReq(path: string, body?: unknown): Request {
	return new Request(`http://localhost${path}`, {
		body: body !== undefined ? JSON.stringify(body) : undefined,
		headers: body !== undefined ? { "content-type": "application/json" } : {},
		method: "POST",
	});
}

function getReq(path: string): Request {
	return new Request(`http://localhost${path}`, { method: "GET" });
}

async function collectNDJSON(res: Response): Promise<unknown[]> {
	const text = await res.text();
	return text
		.split("\n")
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line) as unknown);
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ── 1.1 Streaming abort/cancellation ──────────────────────────────── */

describe("streaming abort/cancellation", () => {
	it("signal is not aborted initially", async () => {
		let signalAborted: boolean | undefined;
		const fns = makeStreamFns([
			"id1",
			{
				fn: async function* (ctx: { signal: AbortSignal }) {
					signalAborted = ctx.signal.aborted;
					yield "ok";
				},
				name: "test",
			},
		]);
		const res = await handleServerFnRequest(postReq("/_flare/server-fn/id1/test"), {}, fns);
		await collectNDJSON(res);
		expect(signalAborted).toBe(false);
	});

	it("generator can check signal.aborted to self-terminate", async () => {
		const controller = new AbortController();
		let yieldCount = 0;
		const fn = createServerFn({ name: "check-signal" }).stream(async function* (ctx) {
			for (let i = 0; i < 10; i++) {
				if (ctx.signal.aborted) break;
				yieldCount++;
				yield i;
				if (i === 1) controller.abort();
			}
		});
		const chunks: number[] = [];
		for await (const chunk of fn(undefined, { signal: controller.signal })) {
			chunks.push(chunk as number);
		}
		expect(yieldCount).toBe(2);
		expect(chunks).toEqual([0, 1]);
	});

	it("generator cleanup via try/finally runs on throw", async () => {
		let finallyCalled = false;
		const fn = createServerFn({ name: "cleanup" }).stream(async function* () {
			try {
				yield 1;
				throw new Error("boom");
			} finally {
				finallyCalled = true;
			}
		});
		const chunks: unknown[] = [];
		try {
			for await (const chunk of fn(undefined)) {
				chunks.push(chunk);
			}
		} catch {
			/* expected */
		}
		expect(finallyCalled).toBe(true);
		expect(chunks).toEqual([1]);
	});

	it("direct invocation: custom signal passed to generator", async () => {
		const controller = new AbortController();
		let receivedSignal: AbortSignal | undefined;
		const fn = createServerFn({ name: "custom-sig" }).stream(async function* (ctx) {
			receivedSignal = ctx.signal;
			yield "ok";
		});
		const chunks: string[] = [];
		for await (const chunk of fn(undefined, { signal: controller.signal })) {
			chunks.push(chunk as string);
		}
		expect(receivedSignal).toBe(controller.signal);
	});

	it("direct invocation: aborting signal mid-iteration stops consumer", async () => {
		const controller = new AbortController();
		const fn = createServerFn({ name: "abort-mid" }).stream(async function* (ctx) {
			yield 1;
			yield 2;
			/* consumer aborts after first chunk so these may not be consumed */
			if (!ctx.signal.aborted) yield 3;
			if (!ctx.signal.aborted) yield 4;
		});
		const chunks: number[] = [];
		for await (const chunk of fn(undefined, { signal: controller.signal })) {
			chunks.push(chunk as number);
			if (chunks.length === 1) controller.abort();
		}
		expect(chunks.length).toBeLessThanOrEqual(2);
		expect(chunks[0]).toBe(1);
	});

	it("direct invocation with no signal creates fresh signal", async () => {
		let receivedSignal: unknown;
		const fn = createServerFn({ name: "no-sig" }).stream(async function* (ctx) {
			receivedSignal = ctx.signal;
			yield "ok";
		});
		for await (const _chunk of fn(undefined)) {
			/* consume */
		}
		expect(receivedSignal).toBeInstanceOf(AbortSignal);
	});
});

/* ── 1.2 Concurrent request isolation ──────────────────────────────── */

describe("concurrent request isolation", () => {
	it("concurrent stream requests produce independent NDJSON", async () => {
		const makeFn = (id: string, chunks: string[]) =>
			makeStreamFns([
				id,
				{
					fn: async function* () {
						for (const c of chunks) {
							await delay(5);
							yield c;
						}
					},
					name: id,
				},
			]);

		const fns1 = makeFn("s1", ["a1", "a2"]);
		const fns2 = makeFn("s2", ["b1", "b2", "b3"]);

		const [res1, res2] = await Promise.all([
			handleServerFnRequest(postReq("/_flare/server-fn/s1/s1"), {}, fns1),
			handleServerFnRequest(postReq("/_flare/server-fn/s2/s2"), {}, fns2),
		]);

		const msgs1 = await collectNDJSON(res1);
		const msgs2 = await collectNDJSON(res2);

		const c1 = msgs1.filter((m): m is { c: string } => "c" in (m as Record<string, unknown>)).map((m) => m.c);
		const c2 = msgs2.filter((m): m is { c: string } => "c" in (m as Record<string, unknown>)).map((m) => m.c);

		expect(c1).toEqual(["a1", "a2"]);
		expect(c2).toEqual(["b1", "b2", "b3"]);
	});

	it("concurrent requests to same fn with different input isolated", async () => {
		const captured: unknown[] = [];
		const fns = makeFns([
			"echo",
			{
				fn: async (ctx) => {
					captured.push(ctx.input);
					return ctx.input;
				},
				name: "echo",
			},
		]);

		const [r1, r2] = await Promise.all([
			handleServerFnRequest(postReq("/_flare/server-fn/echo/echo", { n: 1 }), {}, fns),
			handleServerFnRequest(postReq("/_flare/server-fn/echo/echo", { n: 2 }), {}, fns),
		]);

		const d1 = (await r1.json()) as { data: { n: number } };
		const d2 = (await r2.json()) as { data: { n: number } };

		expect(d1.data).toEqual({ n: 1 });
		expect(d2.data).toEqual({ n: 2 });
	});

	it("concurrent auth + unauth requests don't leak auth state", async () => {
		const fns = makeFns([
			"gated",
			{
				authenticate: true,
				fn: async (ctx) => ({ userId: (ctx.auth as Record<string, unknown>).userId }),
				name: "gated",
			},
		]);
		const authFn = (_env: unknown, req: Request) => {
			const h = req.headers.get("x-auth");
			return h ? { userId: h } : null;
		};

		const authedReq = new Request("http://localhost/_flare/server-fn/gated/gated", {
			body: "{}",
			headers: { "content-type": "application/json", "x-auth": "user-1" },
			method: "POST",
		});
		const unauthedReq = postReq("/_flare/server-fn/gated/gated", {});

		const [r1, r2] = await Promise.all([
			handleServerFnRequest(authedReq, {}, fns, authFn),
			handleServerFnRequest(unauthedReq, {}, fns, authFn),
		]);

		expect(r1.status).toBe(200);
		expect(r2.status).toBe(401);
	});

	it("concurrent piggyback collections isolated per request", async () => {
		const fns = makeFns([
			"pig",
			{
				fn: async (ctx) => {
					const n = (ctx.input as { n: number }).n;
					ctx.piggyback([`key-${n}`], `data-${n}`);
					return { n };
				},
				name: "pig",
			},
		]);

		const [r1, r2] = await Promise.all([
			handleServerFnRequest(postReq("/_flare/server-fn/pig/pig", { n: 1 }), {}, fns),
			handleServerFnRequest(postReq("/_flare/server-fn/pig/pig", { n: 2 }), {}, fns),
		]);

		const j1 = (await r1.json()) as { queries: Array<{ data: unknown; key: unknown[] }> };
		const j2 = (await r2.json()) as { queries: Array<{ data: unknown; key: unknown[] }> };

		expect(j1.queries).toEqual([{ data: "data-1", key: ["key-1"] }]);
		expect(j2.queries).toEqual([{ data: "data-2", key: ["key-2"] }]);
	});

	it("concurrent revalidation calls don't leak tags", async () => {
		const store = makeFlareStore();
		const fns = makeFns([
			"rev",
			{
				fn: async (ctx) => {
					const tags = (ctx.input as { tags: string[] }).tags;
					await ctx.revalidate({ tags, tiers: ["ssr"] });
					return { ok: true };
				},
				name: "rev",
			},
		]);

		const [r1, r2] = await Promise.all([
			runWithServerContext({ nonce: "a", request: new Request("http://localhost"), store: store }, () =>
				handleServerFnRequest(postReq("/_flare/server-fn/rev/rev", { tags: ["a"] }), {}, fns),
			),
			runWithServerContext({ nonce: "b", request: new Request("http://localhost"), store: store }, () =>
				handleServerFnRequest(postReq("/_flare/server-fn/rev/rev", { tags: ["b"] }), {}, fns),
			),
		]);

		const j1 = (await r1.json()) as { revalidatedTags?: string[] };
		const j2 = (await r2.json()) as { revalidatedTags?: string[] };

		expect(j1.revalidatedTags).toEqual(["a"]);
		expect(j2.revalidatedTags).toEqual(["b"]);
	});

	it("10 concurrent requests all return correct data", async () => {
		const fns = makeFns([
			"ten",
			{
				fn: async (ctx) => ({ i: (ctx.input as { i: number }).i }),
				name: "ten",
			},
		]);

		const results = await Promise.all(
			Array.from({ length: 10 }, (_, i) =>
				handleServerFnRequest(postReq("/_flare/server-fn/ten/ten", { i }), {}, fns).then(
					(r) => r.json() as Promise<{ data: { i: number } }>,
				),
			),
		);

		for (let i = 0; i < 10; i++) {
			expect(results[i]?.data).toEqual({ i });
		}
	});
});

/* ── 1.3 Error serialization edge cases ────────────────────────────── */

describe("error serialization edge cases", () => {
	it("Error subclass with extra properties does not leak", async () => {
		class CustomError extends Error {
			code = "CUSTOM_123";
		}
		const fns = makeFns([
			"e1",
			{
				fn: async () => {
					throw new CustomError("custom boom");
				},
				name: "e1",
			},
		]);
		const res = await handleServerFnRequest(postReq("/_flare/server-fn/e1/e1"), {}, fns);
		expect(res.status).toBe(500);
		const json = (await res.json()) as Record<string, unknown>;
		expect(json.message).toBe("Internal server error");
		expect(json).not.toHaveProperty("code");
	});

	it("Error with cause does not leak cause chain", async () => {
		const fns = makeFns([
			"e2",
			{
				fn: async () => {
					throw new Error("outer", { cause: new Error("inner secret") });
				},
				name: "e2",
			},
		]);
		const res = await handleServerFnRequest(postReq("/_flare/server-fn/e2/e2"), {}, fns);
		expect(res.status).toBe(500);
		const json = (await res.json()) as Record<string, unknown>;
		expect(json.message).toBe("Internal server error");
		expect(json).not.toHaveProperty("cause");
	});

	it("ServerFnValidationError with empty fieldErrors", async () => {
		const fns = makeFns([
			"e3",
			{
				fn: async () => {
					throw new ServerFnValidationError({ fieldErrors: {}, formErrors: [] });
				},
				name: "e3",
			},
		]);
		const res = await handleServerFnRequest(postReq("/_flare/server-fn/e3/e3"), {}, fns);
		expect(res.status).toBe(400);
		const json = (await res.json()) as {
			errors: { fieldErrors: Record<string, string[]>; formErrors: string[] };
		};
		expect(json.errors.fieldErrors).toEqual({});
		expect(json.errors.formErrors).toEqual([]);
	});

	it("ServerFnValidationError with multiple fieldErrors", async () => {
		const fns = makeFns([
			"e4",
			{
				fn: async () => {
					throw new ServerFnValidationError({
						fieldErrors: {
							email: ["required", "invalid format"],
							name: ["too short"],
						},
						formErrors: ["General error"],
					});
				},
				name: "e4",
			},
		]);
		const res = await handleServerFnRequest(postReq("/_flare/server-fn/e4/e4"), {}, fns);
		expect(res.status).toBe(400);
		const json = (await res.json()) as {
			errors: { fieldErrors: Record<string, string[]>; formErrors: string[] };
		};
		expect(json.errors.fieldErrors.email).toEqual(["required", "invalid format"]);
		expect(json.errors.fieldErrors.name).toEqual(["too short"]);
		expect(json.errors.formErrors).toEqual(["General error"]);
	});

	it("validator throws non-Error (string)", async () => {
		const fns = makeFns([
			"e5",
			{
				fn: async (ctx) => ctx.input,
				input: {
					parse: () => {
						throw "not a real error";
					},
				},
				name: "e5",
			},
		]);
		const res = await handleServerFnRequest(postReq("/_flare/server-fn/e5/e5", { x: 1 }), {}, fns);
		expect(res.status).toBe(400);
		const json = (await res.json()) as { message: string };
		expect(json.message).toBe("Validation failed");
	});

	it("UnauthenticatedError custom message", async () => {
		const fns = makeFns([
			"e6",
			{
				fn: async () => {
					throw new UnauthenticatedError("Session expired, please log in again");
				},
				name: "e6",
			},
		]);
		const res = await handleServerFnRequest(postReq("/_flare/server-fn/e6/e6"), {}, fns);
		expect(res.status).toBe(401);
		const json = (await res.json()) as { message: string };
		expect(json.message).toBe("Session expired, please log in again");
	});

	it("UnauthorizedError custom message", async () => {
		const fns = makeFns([
			"e7",
			{
				fn: async () => {
					throw new UnauthorizedError("Admin access required");
				},
				name: "e7",
			},
		]);
		const res = await handleServerFnRequest(postReq("/_flare/server-fn/e7/e7"), {}, fns);
		expect(res.status).toBe(403);
		const json = (await res.json()) as { message: string };
		expect(json.message).toBe("Admin access required");
	});

	it("stream error with non-Error yields fallback", async () => {
		const fns = makeStreamFns([
			"e8",
			{
				fn: async function* () {
					throw "just a string";
				},
				name: "e8",
			},
		]);
		const res = await handleServerFnRequest(postReq("/_flare/server-fn/e8/e8"), {}, fns);
		const messages = await collectNDJSON(res);
		expect(messages).toContainEqual({ e: { message: "Stream error" } });
	});

	it("stream error with Error subclass yields message", async () => {
		class StreamBoom extends Error {
			constructor() {
				super("Custom stream boom");
			}
		}
		const fns = makeStreamFns([
			"e9",
			{
				fn: async function* () {
					throw new StreamBoom();
				},
				name: "e9",
			},
		]);
		const res = await handleServerFnRequest(postReq("/_flare/server-fn/e9/e9"), {}, fns);
		const messages = await collectNDJSON(res);
		expect(messages).toContainEqual({ e: { message: "Custom stream boom" } });
	});
});

/* ── 1.4 GET streaming edge cases ──────────────────────────────────── */

describe("GET streaming edge cases", () => {
	it("GET stream returns text/x-ndjson", async () => {
		const fns = makeStreamFns([
			"gs1",
			{
				fn: async function* () {
					yield "ok";
				},
				method: "get",
				name: "gs1",
			},
		]);
		const res = await handleServerFnRequest(getReq("/_flare/server-fn/gs1/gs1"), {}, fns);
		expect(res.headers.get("content-type")).toBe("text/x-ndjson");
	});

	it("GET stream with query params passes parsed input", async () => {
		let capturedInput: unknown;
		const fns = makeStreamFns([
			"gs2",
			{
				fn: async function* (ctx: { input: unknown }) {
					capturedInput = ctx.input;
					yield "ok";
				},
				method: "get",
				name: "gs2",
			},
		]);
		const qs = serializeGetInput({ foo: "bar", n: "42" });
		const res = await handleServerFnRequest(getReq(`/_flare/server-fn/gs2/gs2?${qs}`), {}, fns);
		await collectNDJSON(res);
		expect(capturedInput).toEqual({ foo: "bar", n: "42" });
	});

	it("GET stream with no params passes undefined", async () => {
		let capturedInput: unknown = "sentinel";
		const fns = makeStreamFns([
			"gs3",
			{
				fn: async function* (ctx: { input: unknown }) {
					capturedInput = ctx.input;
					yield "ok";
				},
				method: "get",
				name: "gs3",
			},
		]);
		const res = await handleServerFnRequest(getReq("/_flare/server-fn/gs3/gs3"), {}, fns);
		await collectNDJSON(res);
		expect(capturedInput).toBeUndefined();
	});

	it("GET stream with duplicate params groups into array", async () => {
		let capturedInput: unknown;
		const fns = makeStreamFns([
			"gs4",
			{
				fn: async function* (ctx: { input: unknown }) {
					capturedInput = ctx.input;
					yield "ok";
				},
				method: "get",
				name: "gs4",
			},
		]);
		const res = await handleServerFnRequest(getReq("/_flare/server-fn/gs4/gs4?tag=a&tag=b&tag=c"), {}, fns);
		await collectNDJSON(res);
		expect(capturedInput).toEqual({ tag: ["a", "b", "c"] });
	});

	it("GET stream with input validation validates before streaming", async () => {
		let generatorCalled = false;
		const fns = makeStreamFns([
			"gs5",
			{
				fn: async function* () {
					generatorCalled = true;
					yield "should not reach";
				},
				input: {
					parse: () => {
						throw new Error("invalid input");
					},
				},
				method: "get",
				name: "gs5",
			},
		]);
		const res = await handleServerFnRequest(getReq("/_flare/server-fn/gs5/gs5?x=1"), {}, fns);
		expect(res.status).toBe(400);
		expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
		expect(generatorCalled).toBe(false);
	});

	it("GET stream rejects POST with 405", async () => {
		const fns = makeStreamFns([
			"gs6",
			{
				fn: async function* () {
					yield "ok";
				},
				method: "get",
				name: "gs6",
			},
		]);
		const res = await handleServerFnRequest(postReq("/_flare/server-fn/gs6/gs6"), {}, fns);
		expect(res.status).toBe(405);
	});
});

/* ── 1.5 Streaming + auth combo ────────────────────────────────────── */

describe("streaming + auth combo", () => {
	const authFn = (_env: unknown, req: Request) => {
		const h = req.headers.get("x-auth");
		return h ? { role: h === "admin" ? "admin" : "user", userId: h } : null;
	};

	it("auth passes, UnauthenticatedError mid-stream in NDJSON", async () => {
		const fns = makeStreamFns([
			"sa1",
			{
				authenticate: true,
				fn: async function* () {
					yield "chunk-1";
					throw new UnauthenticatedError("token expired mid-stream");
				},
				name: "sa1",
			},
		]);
		const req = new Request("http://localhost/_flare/server-fn/sa1/sa1", {
			body: "{}",
			headers: { "content-type": "application/json", "x-auth": "user-1" },
			method: "POST",
		});
		const res = await handleServerFnRequest(req, {}, fns, authFn);
		expect(res.status).toBe(200);
		const messages = await collectNDJSON(res);
		expect(messages).toContainEqual({ c: "chunk-1" });
		/* mid-stream error becomes NDJSON error, not HTTP status change */
		const errMsg = messages.find((m): m is { e: { message: string } } => "e" in (m as Record<string, unknown>));
		expect(errMsg?.e.message).toBe("token expired mid-stream");
	});

	it("auth passes, UnauthorizedError mid-stream in NDJSON", async () => {
		const fns = makeStreamFns([
			"sa2",
			{
				authenticate: true,
				fn: async function* () {
					yield "chunk-1";
					throw new UnauthorizedError("permission revoked");
				},
				name: "sa2",
			},
		]);
		const req = new Request("http://localhost/_flare/server-fn/sa2/sa2", {
			body: "{}",
			headers: { "content-type": "application/json", "x-auth": "user-1" },
			method: "POST",
		});
		const res = await handleServerFnRequest(req, {}, fns, authFn);
		const messages = await collectNDJSON(res);
		expect(messages).toContainEqual({ c: "chunk-1" });
		const errMsg = messages.find((m): m is { e: { message: string } } => "e" in (m as Record<string, unknown>));
		expect(errMsg?.e.message).toBe("permission revoked");
	});

	it("auth passes, yields then throws generic Error", async () => {
		const fns = makeStreamFns([
			"sa3",
			{
				authenticate: true,
				fn: async function* () {
					yield "before-error";
					throw new Error("something went wrong");
				},
				name: "sa3",
			},
		]);
		const req = new Request("http://localhost/_flare/server-fn/sa3/sa3", {
			body: "{}",
			headers: { "content-type": "application/json", "x-auth": "user-1" },
			method: "POST",
		});
		const res = await handleServerFnRequest(req, {}, fns, authFn);
		const messages = await collectNDJSON(res);
		expect(messages).toContainEqual({ c: "before-error" });
		expect(messages).toContainEqual({ e: { message: "something went wrong" } });
	});

	it("full chain: authenticate + authorize + stream + error", async () => {
		const fns = makeStreamFns([
			"sa4",
			{
				authenticate: true,
				authorizeFn: ({ auth }) => (auth as { role: string }).role === "admin",
				fn: async function* () {
					yield "admin-data-1";
					yield "admin-data-2";
					throw new Error("db connection lost");
				},
				name: "sa4",
			},
		]);
		const req = new Request("http://localhost/_flare/server-fn/sa4/sa4", {
			body: "{}",
			headers: { "content-type": "application/json", "x-auth": "admin" },
			method: "POST",
		});
		const res = await handleServerFnRequest(req, {}, fns, authFn);
		expect(res.status).toBe(200);
		const messages = await collectNDJSON(res);
		expect(messages).toContainEqual({ c: "admin-data-1" });
		expect(messages).toContainEqual({ c: "admin-data-2" });
		expect(messages).toContainEqual({ e: { message: "db connection lost" } });
	});

	it("authenticated stream yields auth-derived data", async () => {
		const fns = makeStreamFns([
			"sa5",
			{
				authenticate: true,
				fn: async function* (ctx) {
					const auth = ctx.auth as { userId: string };
					yield `Hello ${auth.userId}`;
					yield `Goodbye ${auth.userId}`;
				},
				name: "sa5",
			},
		]);
		const req = new Request("http://localhost/_flare/server-fn/sa5/sa5", {
			body: "{}",
			headers: { "content-type": "application/json", "x-auth": "alice" },
			method: "POST",
		});
		const res = await handleServerFnRequest(req, {}, fns, authFn);
		const messages = await collectNDJSON(res);
		const chunks = messages.filter((m): m is { c: string } => "c" in (m as Record<string, unknown>)).map((m) => m.c);
		expect(chunks).toEqual(["Hello alice", "Goodbye alice"]);
	});

	it("auth fails before streaming: JSON 401, not NDJSON", async () => {
		const fns = makeStreamFns([
			"sa6",
			{
				authenticate: true,
				fn: async function* () {
					yield "should not reach";
				},
				name: "sa6",
			},
		]);
		const res = await handleServerFnRequest(postReq("/_flare/server-fn/sa6/sa6", {}), {}, fns, authFn);
		expect(res.status).toBe(401);
		expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
	});
});
