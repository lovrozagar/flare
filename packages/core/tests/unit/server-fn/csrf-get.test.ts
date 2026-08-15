import { describe, expect, it } from "vitest";
import { runWithServerContext } from "../../../src/server-context/index.ts";
import type { ServerFnHandlerRegistration, ServerFnRegistration } from "../../../src/server-fn/index.ts";
import { handleServerFnRequest } from "../../../src/server-fn/index.ts";

/**
 * Task 7: CSRF origin validation for GET server functions
 *
 * Previously GET requests bypassed origin validation entirely.
 * Fix: validate Origin header on GET when present. If Origin is absent
 * (same-origin GETs from browsers), allow the request.
 */

function createFns(overrides?: Partial<ServerFnHandlerRegistration>): Map<string, ServerFnRegistration> {
	const reg = {
		authenticate: false,
		fn: async (ctx: { input: unknown }) => ({ received: ctx.input }),
		id: "test-fn",
		method: "get",
		name: "testGet",
		...overrides,
	} as ServerFnRegistration;
	return new Map([["test-fn", reg]]);
}

function getRequest(url: string, origin?: string): Request {
	const headers: Record<string, string> = {};
	if (origin) headers.origin = origin;
	return new Request(url, { headers, method: "GET" });
}

async function callHandler(req: Request, fns?: Map<string, ServerFnRegistration>) {
	return runWithServerContext({ nonce: "test", request: req }, () =>
		handleServerFnRequest(req, {}, fns ?? createFns()),
	);
}

describe("Task 7: CSRF GET origin validation", () => {
	it("GET request with matching origin passes", async () => {
		const req = getRequest("http://localhost:3000/_fn/test-fn/testGet", "http://localhost:3000");
		const res = await callHandler(req);
		expect(res.status).toBe(200);
	});

	it("GET request with no origin header passes (same-origin browser behavior)", async () => {
		const req = getRequest("http://localhost:3000/_fn/test-fn/testGet");
		const res = await callHandler(req);
		expect(res.status).toBe(200);
	});

	it("GET request with mismatched origin is rejected", async () => {
		const req = getRequest("http://localhost:3000/_fn/test-fn/testGet", "http://evil.com");
		const res = await callHandler(req);
		expect(res.status).toBe(403);
	});

	it("GET request from different port is rejected", async () => {
		const req = getRequest("http://localhost:3000/_fn/test-fn/testGet", "http://localhost:4000");
		const res = await callHandler(req);
		expect(res.status).toBe(403);
	});

	it("POST request with mismatched origin still rejected (regression)", async () => {
		const fns = createFns({ method: "post" });
		const headers: Record<string, string> = {
			"content-type": "application/json",
			origin: "http://evil.com",
		};
		const req = new Request("http://localhost:3000/_fn/test-fn/testGet", {
			body: JSON.stringify({}),
			headers,
			method: "POST",
		});
		const res = await callHandler(req, fns);
		expect(res.status).toBe(403);
	});

	it("POST request with matching origin passes (regression)", async () => {
		const fns = createFns({ method: "post" });
		const headers: Record<string, string> = {
			"content-type": "application/json",
			origin: "http://localhost:3000",
		};
		const req = new Request("http://localhost:3000/_fn/test-fn/testGet", {
			body: JSON.stringify({}),
			headers,
			method: "POST",
		});
		const res = await callHandler(req, fns);
		expect(res.status).toBe(200);
	});

	it("GET request with Referer fallback when Origin missing — same origin passes", async () => {
		const headers: Record<string, string> = {
			referer: "http://localhost:3000/page",
		};
		const req = new Request("http://localhost:3000/_fn/test-fn/testGet", {
			headers,
			method: "GET",
		});
		const res = await callHandler(req);
		expect(res.status).toBe(200);
	});
});
