import { describe, expect, it, vi } from "vitest";
import { createServerFn } from "../../../src/server-fn/index.ts";

/**
 * Bug 52: Server-side direct invocation bypasses .authenticate()
 *
 * When a server fn is created with .authenticate().handler(...),
 * calling it directly on the server (not via HTTP) passes auth: null
 * to the handler — silently bypassing authentication.
 * This is dangerous: the handler may make security decisions based
 * on ctx.auth being non-null.
 *
 * Expected: direct invocation of an authenticated server fn should throw.
 */

vi.mock("../../../src/server-context", () => ({
	addRevalidatedTags: vi.fn(),
	getRevalidatedTags: vi.fn(() => []),
	getRevalidationContext: vi.fn(() => ({})),
	getServerContext: vi.fn(() => ({})),
}));

vi.mock("../../../src/revalidation", () => ({
	createRevalidateFn: vi.fn(() => vi.fn()),
}));

describe("Bug 52: authenticated server fn direct invocation", () => {
	it("should throw when calling authenticated server fn directly", async () => {
		const fn = createServerFn({ name: "authTest" })
			.authenticate()
			.handler(async (ctx) => {
				return ctx.auth;
			});

		await expect(fn()).rejects.toThrow();
	});

	it("should allow direct invocation of non-authenticated server fn", async () => {
		const fn = createServerFn({ name: "noAuthTest" }).handler(async () => {
			return "ok";
		});

		const result = await fn();
		expect(result).toBe("ok");
	});

	it("should throw when calling authenticated stream fn directly", () => {
		const fn = createServerFn({ name: "streamAuthTest" })
			.authenticate()
			.stream(async function* () {
				yield "chunk";
			});

		/* auth check now throws in the outer function body, not inside [Symbol.asyncIterator] */
		expect(() => fn()).toThrow();
	});
});
