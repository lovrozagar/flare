import { describe, expect, it } from "vitest";
import { createClientOnlyFn, createIsomorphicFn, createServerOnlyFn } from "../../../src/env-fn.ts";

/* Tests run in vitest jsdom environment → import.meta.env.SSR = false.
 * These test the runtime fallback behavior (no Vite plugin transform). */

describe("createServerOnlyFn runtime (client env)", () => {
	it("throws Error with descriptive message", () => {
		const fn = createServerOnlyFn(() => "server-secret");
		expect(() => fn()).toThrow("Server-only function called on client");
	});

	it("thrown error is proper Error instance", () => {
		const fn = createServerOnlyFn(() => "nope");
		try {
			fn();
		} catch (e) {
			expect(e).toBeInstanceOf(Error);
		}
	});

	it("args are ignored (still throws)", () => {
		const fn = createServerOnlyFn((a: number, b: number) => a + b);
		expect(() => fn(1, 2)).toThrow("Server-only function called on client");
	});
});

describe("createClientOnlyFn runtime (client env)", () => {
	it("returns the original function", () => {
		const fn = createClientOnlyFn(() => "client-data");
		expect(fn()).toBe("client-data");
	});

	it("preserves args", () => {
		const add = (a: number, b: number) => a + b;
		const fn = createClientOnlyFn(add);
		expect(fn(3, 4)).toBe(7);
	});

	it("async functions work", async () => {
		const asyncFn = async () => {
			await Promise.resolve();
			return "async-result";
		};
		const fn = createClientOnlyFn(asyncFn);
		await expect(fn()).resolves.toBe("async-result");
	});
});

describe("createIsomorphicFn runtime (client env)", () => {
	it(".server().client() → client impl used", () => {
		const fn = createIsomorphicFn()
			.server(() => "server-impl")
			.client(() => "client-impl");
		expect(fn()).toBe("client-impl");
	});

	it(".client().server() → client impl used", () => {
		const fn = createIsomorphicFn()
			.client(() => "client-impl")
			.server(() => "server-impl");
		expect(fn()).toBe("client-impl");
	});

	it("client-only chain → client impl used", () => {
		const fn = createIsomorphicFn().client(() => "client-only");
		expect(fn()).toBe("client-only");
	});

	it("server-only chain → returns undefined", () => {
		const fn = createIsomorphicFn().server(() => "server-only");
		expect(fn()).toBeUndefined();
	});

	it("client impl receives args", () => {
		const fn = createIsomorphicFn()
			.server((x: number) => x * 2)
			.client((x: number) => x * 3);
		expect(fn(5)).toBe(15);
	});

	it("async client impl works", async () => {
		const fn = createIsomorphicFn()
			.server(() => "sync-server")
			.client(async () => {
				await Promise.resolve();
				return "async-client";
			});
		await expect(fn()).resolves.toBe("async-client");
	});

	it("both impls provided: no cross-contamination at runtime", () => {
		let serverCalled = false;
		let clientCalled = false;

		const fn = createIsomorphicFn()
			.server(() => {
				serverCalled = true;
				return "S";
			})
			.client(() => {
				clientCalled = true;
				return "C";
			});

		fn();
		expect(serverCalled).toBe(false);
		expect(clientCalled).toBe(true);
	});
});
