import { describe, expect, it } from "vitest";
import { runWithServerContext } from "../../../src/server-context/index.ts";
import type { ServerFnHandlerRegistration, ServerFnRegistration } from "../../../src/server-fn/index.ts";
import { handleServerFnRequest } from "../../../src/server-fn/index.ts";

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

async function callHandler(req: Request, fns?: Map<string, ServerFnRegistration>) {
	return runWithServerContext({ nonce: "test", request: req }, () =>
		handleServerFnRequest(req, {}, fns ?? createFns()),
	);
}

const FN_URL = "http://localhost:3000/_flare/server-fn/test-fn/testGet";

describe("GET server-fn CSRF when Origin is omitted", () => {
	it("rejects top-level cross-site GET via Sec-Fetch-Site", async () => {
		const req = new Request(FN_URL, {
			headers: { "sec-fetch-site": "cross-site" },
			method: "GET",
		});
		const res = await callHandler(req);
		expect(res.status).toBe(403);
	});

	it("allows same-origin GET via Sec-Fetch-Site when Origin is omitted", async () => {
		const req = new Request(FN_URL, {
			headers: { "sec-fetch-site": "same-origin" },
			method: "GET",
		});
		const res = await callHandler(req);
		expect(res.status).toBe(200);
	});

	it("allows user-initiated GET (Sec-Fetch-Site: none)", async () => {
		const req = new Request(FN_URL, {
			headers: { "sec-fetch-site": "none" },
			method: "GET",
		});
		const res = await callHandler(req);
		expect(res.status).toBe(200);
	});

	it("rejects unknown Sec-Fetch-Site (fail-closed)", async () => {
		const req = new Request(FN_URL, {
			headers: { "sec-fetch-site": "evil" },
			method: "GET",
		});
		const res = await callHandler(req);
		expect(res.status).toBe(403);
	});

	it("rejects missing Origin with a cross-origin Referer", async () => {
		const req = new Request(FN_URL, {
			headers: { referer: "http://evil.com/page" },
			method: "GET",
		});
		const res = await callHandler(req);
		expect(res.status).toBe(403);
	});

	it("allows missing Origin with a same-origin Referer", async () => {
		const req = new Request(FN_URL, {
			headers: { referer: "http://localhost:3000/page" },
			method: "GET",
		});
		const res = await callHandler(req);
		expect(res.status).toBe(200);
	});

	it("rejects a malformed Referer when Origin is omitted", async () => {
		const req = new Request(FN_URL, {
			headers: { referer: "not-a-url" },
			method: "GET",
		});
		const res = await callHandler(req);
		expect(res.status).toBe(403);
	});

	it("still allows non-browser GET with no Origin, Sec-Fetch-Site, or Referer", async () => {
		const req = new Request(FN_URL, { method: "GET" });
		const res = await callHandler(req);
		expect(res.status).toBe(200);
	});

	it("Origin mismatch still wins even if Sec-Fetch-Site is same-origin", async () => {
		const req = new Request(FN_URL, {
			headers: {
				origin: "http://evil.com",
				"sec-fetch-site": "same-origin",
			},
			method: "GET",
		});
		const res = await callHandler(req);
		expect(res.status).toBe(403);
	});
});
