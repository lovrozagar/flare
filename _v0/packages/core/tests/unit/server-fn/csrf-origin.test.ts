import { describe, expect, it } from "vitest";
import { runWithServerContext } from "../../../src/server-context/index.ts";
import type { ServerFnHandlerRegistration, ServerFnRegistration } from "../../../src/server-fn/index.ts";
import { handleServerFnRequest } from "../../../src/server-fn/index.ts";

/* ── helpers ───────────────────────────────────────────────────────── */

function createFns(overrides?: Partial<ServerFnHandlerRegistration>): Map<string, ServerFnRegistration> {
	const reg = {
		authenticate: false,
		fn: async (ctx) => ({ received: ctx.input }),
		id: "test-fn",
		method: "post",
		name: "test",
		...overrides,
	} as ServerFnRegistration;
	return new Map([["test-fn", reg]]);
}

function postJson(url: string, origin?: string): Request {
	const headers: Record<string, string> = { "content-type": "application/json" };
	if (origin) headers.origin = origin;
	return new Request(url, {
		body: JSON.stringify({ email: "a@b.com" }),
		headers,
		method: "POST",
	});
}

async function runInContext<T>(fn: () => T | Promise<T>): Promise<T> {
	return runWithServerContext({ nonce: "test-nonce", request: new Request("http://localhost") }, () => fn());
}

/* ── CSRF Origin validation via handleServerFnRequest ─────────────── */

describe("handleServerFnRequest CSRF Origin validation", () => {
	const FN_URL = "http://localhost/_flare/server-fn/test-fn/test";

	/* ── allowed requests ─────────────────────────────────────────── */

	it("CSRF1: same-origin POST → 200", async () => {
		const fns = createFns();
		const res = await runInContext(() => handleServerFnRequest(postJson(FN_URL, "http://localhost"), {}, fns));
		expect(res.status).toBe(200);
	});

	it("CSRF2: missing Origin header → 200 (non-browser)", async () => {
		const fns = createFns();
		const res = await runInContext(() => handleServerFnRequest(postJson(FN_URL), {}, fns));
		expect(res.status).toBe(200);
	});

	it("CSRF3: same-origin https → 200", async () => {
		const fns = createFns();
		const url = "https://app.com/_flare/server-fn/test-fn/test";
		const res = await runInContext(() => handleServerFnRequest(postJson(url, "https://app.com"), {}, fns));
		expect(res.status).toBe(200);
	});

	/* ── blocked requests ─────────────────────────────────────────── */

	it("CSRF5: cross-origin POST → 403", async () => {
		const fns = createFns();
		const res = await runInContext(() => handleServerFnRequest(postJson(FN_URL, "http://evil.com"), {}, fns));
		expect(res.status).toBe(403);
		const json = (await res.json()) as { message: string };
		expect(json.message).toBe("Origin mismatch");
	});

	it("CSRF6: cross-origin FormData POST → 403", async () => {
		const fns = createFns();
		const fd = new FormData();
		fd.append("email", "a@b.com");
		const req = new Request(FN_URL, {
			body: fd,
			headers: { origin: "http://evil.com" },
			method: "POST",
		});
		const res = await runInContext(() => handleServerFnRequest(req, {}, fns));
		expect(res.status).toBe(403);
	});

	it("CSRF7: port mismatch → 403", async () => {
		const fns = createFns();
		const url = "http://localhost:3000/_flare/server-fn/test-fn/test";
		const res = await runInContext(() => handleServerFnRequest(postJson(url, "http://localhost:4000"), {}, fns));
		expect(res.status).toBe(403);
	});

	it("CSRF8: scheme mismatch (http vs https) → 403", async () => {
		const fns = createFns();
		const url = "https://app.com/_flare/server-fn/test-fn/test";
		const res = await runInContext(() => handleServerFnRequest(postJson(url, "http://app.com"), {}, fns));
		expect(res.status).toBe(403);
	});

	it("CSRF9: null origin (sandboxed iframe) → 403", async () => {
		const fns = createFns();
		const res = await runInContext(() => handleServerFnRequest(postJson(FN_URL, "null"), {}, fns));
		expect(res.status).toBe(403);
	});

	it("CSRF10: subdomain mismatch → 403", async () => {
		const fns = createFns();
		const url = "https://app.example.com/_flare/server-fn/test-fn/test";
		const res = await runInContext(() => handleServerFnRequest(postJson(url, "https://evil.example.com"), {}, fns));
		expect(res.status).toBe(403);
	});

	/* ── ordering: CSRF rejects before auth/validation ────────────── */

	it("CSRF11: rejects before authentication runs", async () => {
		let authCalled = false;
		const fns = createFns({ authenticate: true });
		const authFn = () => {
			authCalled = true;
			return { userId: "admin" };
		};
		const res = await runInContext(() => handleServerFnRequest(postJson(FN_URL, "http://evil.com"), {}, fns, authFn));
		expect(res.status).toBe(403);
		expect(authCalled).toBe(false);
	});

	it("CSRF12: rejects before input validation runs", async () => {
		let validatorCalled = false;
		const fns = createFns({
			input: (raw: unknown) => {
				validatorCalled = true;
				return raw;
			},
		});
		const res = await runInContext(() => handleServerFnRequest(postJson(FN_URL, "http://evil.com"), {}, fns));
		expect(res.status).toBe(403);
		expect(validatorCalled).toBe(false);
	});

	/* GET requests with cross-origin header now rejected (Task 7 fix) */
	it("CSRF13: GET with cross-origin header → rejected", async () => {
		const fns = createFns({ method: "get" });
		const req = new Request(FN_URL, {
			headers: { origin: "http://evil.com" },
			method: "GET",
		});
		const res = await runInContext(() => handleServerFnRequest(req, {}, fns));
		expect(res.status).toBe(403);
	});
});
