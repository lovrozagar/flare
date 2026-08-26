/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest";
import { runWithServerContext } from "../../../src/server-context/index.ts";
import type { ServerFnHandlerRegistration, ServerFnRegistration } from "../../../src/server-fn/index.ts";
import { handleServerFnRequest, SERVER_FN_MAX_BODY_BYTES } from "../../../src/server-fn/index.ts";

function createFns(overrides?: Partial<ServerFnHandlerRegistration>): Map<string, ServerFnRegistration> {
	const reg = {
		authenticate: false,
		fn: vi.fn(async (ctx: { input: unknown }) => ctx.input),
		id: "id1",
		method: "post",
		name: "test",
		...overrides,
	} as ServerFnRegistration;
	return new Map([["id1", reg]]);
}

function postReq(init: RequestInit): Request {
	return new Request("http://localhost/_flare/server-fn/id1/test", {
		method: "POST",
		...init,
	});
}

async function call(req: Request, fns = createFns()): Promise<Response> {
	return runWithServerContext({ nonce: "test", request: req }, () => handleServerFnRequest(req, {}, fns));
}

describe("handleServerFnRequest body cap", () => {
	it("JSON body over the cap returns 413", async () => {
		const fns = createFns();
		const res = await call(
			postReq({
				body: "x".repeat(SERVER_FN_MAX_BODY_BYTES + 1),
				headers: { "content-type": "application/json" },
			}),
			fns,
		);
		expect(res.status).toBe(413);
		expect((fns.get("id1") as ServerFnHandlerRegistration).fn).not.toHaveBeenCalled();
	});

	it("Content-Length over the cap returns 413 without invoking the handler", async () => {
		const fns = createFns();
		const res = await call(
			postReq({
				body: "{}",
				headers: {
					"content-length": String(SERVER_FN_MAX_BODY_BYTES + 1),
					"content-type": "application/json",
				},
			}),
			fns,
		);
		expect(res.status).toBe(413);
		expect((fns.get("id1") as ServerFnHandlerRegistration).fn).not.toHaveBeenCalled();
	});

	it("urlencoded body over the cap returns 413", async () => {
		const fns = createFns();
		const res = await call(
			postReq({
				body: `q=${"x".repeat(SERVER_FN_MAX_BODY_BYTES)}`,
				headers: { "content-type": "application/x-www-form-urlencoded" },
			}),
			fns,
		);
		expect(res.status).toBe(413);
		expect((fns.get("id1") as ServerFnHandlerRegistration).fn).not.toHaveBeenCalled();
	});
});
