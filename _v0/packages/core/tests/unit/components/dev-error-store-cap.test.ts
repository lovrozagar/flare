import { describe, expect, it } from "vitest";
import { createDevErrorStore } from "../../../src/components/index.ts";

const MAX_DEV_ERRORS = 100;

describe("dev error store cap", () => {
	it("caps at MAX_DEV_ERRORS when registering many unique errors", () => {
		/*
		 * Bug 78: store grows without limit. A broken effect loop
		 * producing unique errors causes unbounded memory + unresponsive overlay.
		 */
		const store = createDevErrorStore();

		for (let i = 0; i < 200; i++) {
			const err = new Error(`error-${i}`);
			err.stack = `Error: error-${i}\n  at test:${i}`;
			store.register(err, "test");
		}

		expect(store.errors().length).toBeLessThanOrEqual(MAX_DEV_ERRORS);
	});

	it("evicts dismissed entries first when at cap", () => {
		const store = createDevErrorStore();

		/* Fill to cap */
		for (let i = 0; i < MAX_DEV_ERRORS; i++) {
			const err = new Error(`error-${i}`);
			err.stack = `Error: error-${i}\n  at test:${i}`;
			store.register(err, "test");
		}

		/* Dismiss first 10 */
		const ids = store
			.errors()
			.slice(0, 10)
			.map((e) => e.id);
		for (const id of ids) {
			store.dismiss(id);
		}

		/* Register 10 more — should evict dismissed ones first */
		for (let i = MAX_DEV_ERRORS; i < MAX_DEV_ERRORS + 10; i++) {
			const err = new Error(`error-${i}`);
			err.stack = `Error: error-${i}\n  at test:${i}`;
			store.register(err, "test");
		}

		expect(store.errors().length).toBeLessThanOrEqual(MAX_DEV_ERRORS);
		/* None of the dismissed errors should remain */
		const remaining = store.errors();
		for (const id of ids) {
			expect(remaining.some((e) => e.id === id)).toBe(false);
		}
	});

	it("evicts oldest non-dismissed when no dismissed entries exist", () => {
		const store = createDevErrorStore();

		/* Fill to cap */
		for (let i = 0; i < MAX_DEV_ERRORS; i++) {
			const err = new Error(`error-${i}`);
			err.stack = `Error: error-${i}\n  at test:${i}`;
			store.register(err, "test");
		}

		const firstId = store.errors()[0]?.id;

		/* Register one more — should evict oldest */
		const extra = new Error("overflow");
		extra.stack = "Error: overflow\n  at test:999";
		store.register(extra, "test");

		expect(store.errors().length).toBe(MAX_DEV_ERRORS);
		expect(store.errors().some((e) => e.id === firstId)).toBe(false);
		expect(store.errors().some((e) => e.error.message === "overflow")).toBe(true);
	});

	it("under cap still works normally", () => {
		const store = createDevErrorStore();

		for (let i = 0; i < 10; i++) {
			const err = new Error(`error-${i}`);
			err.stack = `Error: error-${i}\n  at test:${i}`;
			store.register(err, "test");
		}

		expect(store.errors().length).toBe(10);
	});
});
