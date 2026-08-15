import { describe, expect, it } from "vitest";
import { ServerFnValidationError } from "../../../src/errors/index.ts";
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

function makeRequest(url: string, init?: RequestInit): Request {
	return new Request(url, { method: "POST", ...init });
}

async function runInContext<T>(fn: () => T | Promise<T>): Promise<T> {
	return runWithServerContext({ nonce: "test-nonce", request: new Request("http://localhost") }, () => fn());
}

/* ── H1: FormData urlencoded ───────────────────────────────────────── */

describe("handleServerFnRequest FormData support", () => {
	it("H1: parses x-www-form-urlencoded input", async () => {
		const fns = createFns();
		const body = new URLSearchParams({ email: "a@b.com", name: "Jo" });
		const req = makeRequest("http://localhost/_fn/test-fn/test", {
			body: body.toString(),
			headers: { "content-type": "application/x-www-form-urlencoded" },
		});
		const res = await runInContext(() => handleServerFnRequest(req, {}, fns));
		expect(res.status).toBe(200);
		const json = (await res.json()) as { data: { received: unknown } };
		expect(json.data.received).toEqual({ email: "a@b.com", name: "Jo" });
	});

	/* H2: FormData multipart */
	it("H2: parses multipart/form-data input", async () => {
		const fns = createFns();
		const fd = new FormData();
		fd.append("email", "a@b.com");
		fd.append("name", "Jo");
		const req = makeRequest("http://localhost/_fn/test-fn/test", {
			body: fd,
		});
		const res = await runInContext(() => handleServerFnRequest(req, {}, fns));
		expect(res.status).toBe(200);
		const json = (await res.json()) as { data: { received: unknown } };
		expect(json.data.received).toEqual({ email: "a@b.com", name: "Jo" });
	});

	/* H3: JSON body */
	it("H3: parses JSON body", async () => {
		const fns = createFns();
		const req = makeRequest("http://localhost/_fn/test-fn/test", {
			body: JSON.stringify({ email: "a@b.com" }),
			headers: { "content-type": "application/json" },
		});
		const res = await runInContext(() => handleServerFnRequest(req, {}, fns));
		expect(res.status).toBe(200);
		const json = (await res.json()) as { data: { received: unknown } };
		expect(json.data.received).toEqual({ email: "a@b.com" });
	});

	/* H4: No content-type, empty body */
	it("H4: handles no content-type with empty body", async () => {
		const fns = createFns();
		const req = makeRequest("http://localhost/_fn/test-fn/test", {
			body: undefined,
			headers: {},
		});
		const res = await runInContext(() => handleServerFnRequest(req, {}, fns));
		expect(res.status).toBe(200);
		const json = (await res.json()) as { data: { received: unknown } };
		expect(json.data.received).toBeUndefined();
	});

	/* H5: Invalid JSON → 400 */
	it("H5: returns 400 for invalid JSON", async () => {
		const fns = createFns();
		const req = makeRequest("http://localhost/_fn/test-fn/test", {
			body: "{broken json",
			headers: { "content-type": "application/json" },
		});
		const res = await runInContext(() => handleServerFnRequest(req, {}, fns));
		expect(res.status).toBe(400);
		const json = (await res.json()) as { message: string };
		expect(json.message).toBe("Invalid JSON");
	});

	/* H6: FormData + Standard Schema validation error → 400 with fieldErrors */
	it("H6: FormData with Standard Schema validation error returns fieldErrors", async () => {
		const fns = createFns({
			input: {
				"~standard": {
					validate: () => ({
						issues: [
							{ message: "Required", path: ["email"] },
							{ message: "Too short", path: ["name"] },
						],
					}),
					vendor: "test",
					version: 1 as const,
				},
			},
		});
		const fd = new FormData();
		fd.append("email", "");
		fd.append("name", "");
		const req = makeRequest("http://localhost/_fn/test-fn/test", { body: fd });
		const res = await runInContext(() => handleServerFnRequest(req, {}, fns));
		expect(res.status).toBe(400);
		const json = (await res.json()) as {
			errors: { fieldErrors: Record<string, string[]>; formErrors: string[] };
			message: string;
		};
		expect(json.errors.fieldErrors).toEqual({
			email: ["Required"],
			name: ["Too short"],
		});
		expect(json.errors.formErrors).toEqual([]);
	});

	/* Extra: __flare_fn stripped from FormData input */
	it("strips __flare_fn from FormData before passing to handler", async () => {
		const fns = createFns();
		const fd = new FormData();
		fd.append("__flare_fn", "some-id");
		fd.append("email", "a@b.com");
		const req = makeRequest("http://localhost/_fn/test-fn/test", { body: fd });
		const res = await runInContext(() => handleServerFnRequest(req, {}, fns));
		expect(res.status).toBe(200);
		const json = (await res.json()) as { data: { received: Record<string, unknown> } };
		expect(json.data.received).toEqual({ email: "a@b.com" });
		expect("__flare_fn" in (json.data.received as Record<string, unknown>)).toBe(false);
	});
});
