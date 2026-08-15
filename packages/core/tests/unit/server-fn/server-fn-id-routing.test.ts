/**
 * Bug: Server function routing uses `name` for map key and URL, but `__id` (unique hash)
 * exists to prevent collisions. Two server functions with the same name but different
 * __id values collide because the map is keyed by name.
 *
 * The fix: map should be keyed by `id` (= __id || name), and URLs should use id/name.
 */
/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest";

vi.mock("vite-plugin-solid", () => ({
	default: () => ({ name: "solid" }),
}));

import { runWithServerContext } from "../../../src/server-context/index.ts";
import type { ServerFnHandlerRegistration, ServerFnRegistration } from "../../../src/server-fn/index.ts";
import {
	createServerFn,
	handleServerFnRequest,
	serverFnMutationOptions,
	serverFnQueryOptions,
} from "../../../src/server-fn/index.ts";

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

function postReq(path: string, body?: unknown): Request {
	return new Request(`http://localhost${path}`, {
		body: body !== undefined ? JSON.stringify(body) : undefined,
		headers: body !== undefined ? { "content-type": "application/json" } : {},
		method: "POST",
	});
}

describe("server function id-based routing", () => {
	describe("handleServerFnRequest resolves by id", () => {
		it("finds registration when URL uses id as first segment", async () => {
			const fns = new Map<string, ServerFnRegistration>();
			fns.set("hash-abc", makeReg({ id: "hash-abc", name: "getData" }));

			const result = await runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, () =>
				handleServerFnRequest(postReq("/_fn/hash-abc/getData", { q: "test" }), {}, fns),
			);
			expect(result.status).toBe(200);
		});

		it("two functions with same name but different id are both accessible", async () => {
			const fns = new Map<string, ServerFnRegistration>();
			fns.set(
				"hash-1",
				makeReg({
					fn: async () => "result-A",
					id: "hash-1",
					name: "getData",
				}),
			);
			fns.set(
				"hash-2",
				makeReg({
					fn: async () => "result-B",
					id: "hash-2",
					name: "getData",
				}),
			);

			const resultA = await runWithServerContext(
				{ nonce: "x", request: new Request("http://localhost/") },
				async () => {
					const resp = await handleServerFnRequest(postReq("/_fn/hash-1/getData"), {}, fns);
					return resp.json();
				},
			);
			expect((resultA as Record<string, unknown>).data).toBe("result-A");

			const resultB = await runWithServerContext(
				{ nonce: "x", request: new Request("http://localhost/") },
				async () => {
					const resp = await handleServerFnRequest(postReq("/_fn/hash-2/getData"), {}, fns);
					return resp.json();
				},
			);
			expect((resultB as Record<string, unknown>).data).toBe("result-B");
		});

		it("rejects when id matches but name does not", async () => {
			const fns = new Map<string, ServerFnRegistration>();
			fns.set("hash-abc", makeReg({ id: "hash-abc", name: "getData" }));

			const result = await runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, () =>
				handleServerFnRequest(postReq("/_fn/hash-abc/wrongName"), {}, fns),
			);
			expect(result.status).toBe(404);
		});
	});

	describe("serverFnQueryOptions uses id in URL", () => {
		it("constructs URL with id/name when __id is set", () => {
			const fn = createServerFn({ __id: "hash-abc", name: "getData" }).handler(async () => "ok");

			const opts = serverFnQueryOptions(fn);

			/* The queryFn constructs the URL internally; verify via a client-side fetch spy */
			const reg = fn._registration;
			expect(reg?.id).toBe("hash-abc");
			expect(reg?.name).toBe("getData");

			/* queryKey still uses name for human readability */
			expect(opts.queryKey).toEqual(["getData", undefined]);
		});

		it("client-side fetch URL uses id as first segment", async () => {
			const originalWindow = globalThis.window;
			let capturedUrl = "";
			(globalThis as Record<string, unknown>).window = {};
			const originalFetch = globalThis.fetch;
			globalThis.fetch = async (url) => {
				capturedUrl = String(url);
				return new Response(JSON.stringify({ data: "ok" }), {
					headers: { "content-type": "application/json" },
				});
			};

			try {
				const fn = createServerFn({ __id: "hash-xyz", name: "myFn" }).handler(async () => "ok");
				const opts = serverFnQueryOptions(fn, { input: undefined });
				await opts.queryFn();

				expect(capturedUrl).toBe("/_fn/hash-xyz/myFn");
			} finally {
				globalThis.fetch = originalFetch;
				if (originalWindow === undefined) {
					delete (globalThis as Record<string, unknown>).window;
				} else {
					(globalThis as Record<string, unknown>).window = originalWindow;
				}
			}
		});
	});

	describe("serverFnMutationOptions uses id in URL", () => {
		it("client-side fetch URL uses id as first segment", async () => {
			const originalWindow = globalThis.window;
			let capturedUrl = "";
			(globalThis as Record<string, unknown>).window = {};
			const originalFetch = globalThis.fetch;
			globalThis.fetch = async (url) => {
				capturedUrl = String(url);
				return new Response(JSON.stringify({ data: "ok" }), {
					headers: { "content-type": "application/json" },
				});
			};

			try {
				const fn = createServerFn({ __id: "mut-hash", name: "updateItem" }).handler(async () => "done");
				const opts = serverFnMutationOptions(fn);
				await opts.mutationFn("input" as never);

				expect(capturedUrl).toBe("/_fn/mut-hash/updateItem");
			} finally {
				globalThis.fetch = originalFetch;
				if (originalWindow === undefined) {
					delete (globalThis as Record<string, unknown>).window;
				} else {
					(globalThis as Record<string, unknown>).window = originalWindow;
				}
			}
		});
	});
});

describe("generateServerFnMapSource keys by id", () => {
	it("generated collector uses _registration.id as map key", async () => {
		const { generateServerFnMapSource } = await import("../../../src/plugins/index");
		const source = generateServerFnMapSource(["/src/fns.ts"]);

		/* The generated code should use .id for map key */
		expect(source).toContain("map.set(r.id, r)");
	});

	it("generated collector adds name-based fallback for unique names", async () => {
		const { generateServerFnMapSource } = await import("../../../src/plugins/index");
		const source = generateServerFnMapSource(["/src/fns.ts"]);

		/* Name-based fallback for backward compatibility */
		expect(source).toContain("if (r.id !== r.name && _names.get(r.name) === 1) map.set(r.name, r)");
	});
});
