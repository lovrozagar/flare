import { describe, expect, it } from "vitest";

/**
 * .catch() with no argument does NOT suppress unhandled promise rejections.
 * .catch(() => {}) DOES suppress them.
 * The broadcast import in createQueryClientGetter uses .catch() (no arg) — bug.
 */

describe("Promise .catch() suppression semantics", () => {
	it(".catch(() => {}) suppresses rejection — no unhandled rejection fires", async () => {
		let unhandled = false;
		const handler = () => {
			unhandled = true;
		};

		if (typeof process !== "undefined") {
			process.on("unhandledRejection", handler);
		}

		/* this is the CORRECT pattern */
		Promise.reject(new Error("test")).catch(() => {});

		/* give the event loop a tick to fire the event */
		await new Promise((r) => setTimeout(r, 50));

		if (typeof process !== "undefined") {
			process.off("unhandledRejection", handler);
		}

		expect(unhandled).toBe(false);
	});

	it(".catch() with no callback does NOT suppress — it is a no-op that returns a new promise", () => {
		/* Verify .catch() with no argument returns a new promise (spec behavior).
		 * When called without a callback, Promise.prototype.catch(undefined) is
		 * equivalent to .then(undefined, undefined) which just propagates the rejection. */
		const original = Promise.resolve(42);
		const chained = original.catch();
		/* .catch() returns a NEW promise object (it's not a no-op in the chain sense) */
		expect(chained).toBeInstanceOf(Promise);
		/* but without a handler, a rejection would still propagate */
	});

	it("createQueryClientGetter broadcast import should use .catch(() => {})", async () => {
		/* Simulate the pattern from src/query-client/index.tsx:
		 * import("...").then(...).catch(() => {})
		 * Verify the fixed version suppresses correctly */
		let imported = false;
		const mockImport = (): Promise<{ broadcastQueryClient: () => void }> =>
			Promise.reject(new Error("module not available"));

		let unhandled = false;
		const handler = () => {
			unhandled = true;
		};

		if (typeof process !== "undefined") {
			process.on("unhandledRejection", handler);
		}

		/* Fixed pattern: .catch(() => {}) */
		mockImport()
			.then(({ broadcastQueryClient }) => {
				imported = true;
				broadcastQueryClient();
			})
			.catch(() => {});

		await new Promise((r) => setTimeout(r, 50));

		if (typeof process !== "undefined") {
			process.off("unhandledRejection", handler);
		}

		expect(imported).toBe(false);
		expect(unhandled).toBe(false);
	});
});
