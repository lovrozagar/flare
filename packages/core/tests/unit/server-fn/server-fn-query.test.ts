/** @vitest-environment node */
import { afterEach, describe, expect, it } from "vitest";
import { isServerFnValidationError } from "../../../src/errors/index.ts";
import { serverFnMutationOptions, serverFnQueryOptions } from "../../../src/server-fn-query.ts";

interface ServerFnLike<TInput, TOutput> {
	(input: TInput): Promise<TOutput>;
	_registration?: { id?: string; method?: string; name: string };
}

function makeFn<TInput, TOutput>(reg: { id?: string; method?: string; name: string }): ServerFnLike<TInput, TOutput> {
	const fn = (async () => {
		throw new Error("direct call");
	}) as ServerFnLike<TInput, TOutput>;
	fn._registration = reg;
	return fn;
}

const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;

function mockClientEnv(mockFetch: typeof globalThis.fetch): void {
	(globalThis as Record<string, unknown>).window = {};
	globalThis.fetch = mockFetch;
}

function restoreEnv(): void {
	if (originalWindow === undefined) {
		delete (globalThis as Record<string, unknown>).window;
	} else {
		(globalThis as Record<string, unknown>).window = originalWindow;
	}
	globalThis.fetch = originalFetch;
}

afterEach(() => {
	restoreEnv();
});

describe("server-fn-query client export", () => {
	it("queryFn throws ServerFnValidationError for 400 bodies with errors", async () => {
		mockClientEnv(async () => {
			return new Response(
				JSON.stringify({
					errors: { fieldErrors: { email: ["required"] }, formErrors: ["bad data"] },
					message: "bad data",
				}),
				{ status: 400 },
			);
		});

		const opts = serverFnQueryOptions(makeFn({ id: "id1", name: "create" }), { input: { email: "" } });
		await expect(opts.queryFn()).rejects.toSatisfy((e: unknown) => {
			expect(isServerFnValidationError(e)).toBe(true);
			if (isServerFnValidationError(e)) {
				expect(e.errors).toEqual({ fieldErrors: { email: ["required"] }, formErrors: ["bad data"] });
			}
			return true;
		});
	});

	it("mutationFn throws ServerFnValidationError for 400 bodies with errors", async () => {
		mockClientEnv(async () => {
			return new Response(
				JSON.stringify({
					errors: { fieldErrors: { name: ["too short"] }, formErrors: [] },
					message: "Validation error",
				}),
				{ status: 400 },
			);
		});

		const opts = serverFnMutationOptions(makeFn({ id: "id1", name: "rename" }));
		await expect(opts.mutationFn({ name: "a" })).rejects.toSatisfy((e: unknown) => {
			expect(isServerFnValidationError(e)).toBe(true);
			return true;
		});
	});

	it("GET queryFn JSON-encodes nested objects instead of [object Object]", async () => {
		let capturedUrl = "";
		mockClientEnv(async (url) => {
			capturedUrl = String(url);
			return new Response(JSON.stringify({ data: [] }), {
				headers: { "content-type": "application/json" },
			});
		});

		const opts = serverFnQueryOptions(makeFn({ id: "search-id", method: "get", name: "search" }), {
			input: { filter: { status: "open" }, q: "hello" },
		});
		await opts.queryFn();

		const parsed = new URL(capturedUrl, "http://localhost");
		expect(parsed.searchParams.get("q")).toBe("hello");
		expect(parsed.searchParams.get("filter")).toBe(JSON.stringify({ status: "open" }));
		expect(capturedUrl).not.toContain("[object Object]");
	});
});
