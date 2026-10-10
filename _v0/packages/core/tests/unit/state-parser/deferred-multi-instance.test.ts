import { afterEach, describe, expect, it } from "vitest";
import type { DeferredResolver } from "../../../src/state-parser/index.ts";
import { installDeferredResolver } from "../../../src/state-parser/index.ts";

function cleanGlobals() {
	globalThis.__flare_r = undefined;
	globalThis.__flare_re = undefined;
	globalThis.__flare_defer = undefined;
}

describe("Task 4: deferred multi-instance resolver", () => {
	afterEach(cleanGlobals);

	it("single instance: resolve works and cleans up globals", () => {
		const resolvers = new Map<string, DeferredResolver>();
		let resolved: unknown = null;
		resolvers.set("m1:title", {
			reject: () => {},
			resolve: (d) => {
				resolved = d;
			},
		});

		installDeferredResolver(resolvers);
		expect(globalThis.__flare_r).toBeUndefined();
		expect(globalThis.__flare_re).toBeUndefined();
		expect(globalThis.__flare_defer).toBeDefined();

		const q = globalThis.__flare_defer;
		if (q) q.push(["m1:title", "hello"]);
		expect(resolved).toBe("hello");
		expect(resolvers.size).toBe(0);

		/* globals cleaned after all resolved */
		expect(globalThis.__flare_r).toBeUndefined();
		expect(globalThis.__flare_re).toBeUndefined();
		expect(globalThis.__flare_defer).toBeUndefined();
	});

	it("single instance: reject works", () => {
		const resolvers = new Map<string, DeferredResolver>();
		let rejected: Error | null = null;
		resolvers.set("m1:data", {
			reject: (e) => {
				rejected = e;
			},
			resolve: () => {},
		});

		installDeferredResolver(resolvers);
		const q = globalThis.__flare_defer;
		if (q) q.push(["m1:data", "boom", true]);
		expect((rejected as Error | null)?.message).toBe("boom");
		expect(resolvers.size).toBe(0);
	});

	it("two instances: both receive their entries via __flare_r", () => {
		const resolvers1 = new Map<string, DeferredResolver>();
		let resolved1: unknown = null;
		resolvers1.set("a:x", {
			reject: () => {},
			resolve: (d) => {
				resolved1 = d;
			},
		});

		const resolvers2 = new Map<string, DeferredResolver>();
		let resolved2: unknown = null;
		resolvers2.set("b:y", {
			reject: () => {},
			resolve: (d) => {
				resolved2 = d;
			},
		});

		installDeferredResolver(resolvers1);
		installDeferredResolver(resolvers2);

		const q = globalThis.__flare_defer;
		if (q) q.push(["b:y", "two"]);
		expect(resolved2).toBe("two");

		if (q) q.push(["a:x", "one"]);
		expect(resolved1).toBe("one");
	});

	it("two instances: late push routes to correct resolver", () => {
		const resolvers1 = new Map<string, DeferredResolver>();
		let resolved1: unknown = null;
		resolvers1.set("a:z", {
			reject: () => {},
			resolve: (d) => {
				resolved1 = d;
			},
		});

		const resolvers2 = new Map<string, DeferredResolver>();
		let resolved2: unknown = null;
		resolvers2.set("b:z", {
			reject: () => {},
			resolve: (d) => {
				resolved2 = d;
			},
		});

		installDeferredResolver(resolvers1);
		installDeferredResolver(resolvers2);

		/* late SSR script push */
		const q = globalThis.__flare_defer;
		if (q && "push" in q) {
			q.push(["a:z", "late-one"]);
			q.push(["b:z", "late-two"]);
		}

		expect(resolved1).toBe("late-one");
		expect(resolved2).toBe("late-two");
	});

	it("two instances: globals only cleaned when ALL drained", () => {
		const resolvers1 = new Map<string, DeferredResolver>();
		resolvers1.set("a:k", {
			reject: () => {},
			resolve: () => {},
		});

		const resolvers2 = new Map<string, DeferredResolver>();
		resolvers2.set("b:k", {
			reject: () => {},
			resolve: () => {},
		});

		installDeferredResolver(resolvers1);
		installDeferredResolver(resolvers2);

		const q = globalThis.__flare_defer;
		if (q) q.push(["b:k", "ok"]);
		/* instance 1 still has pending — defer proxy must remain */
		expect(globalThis.__flare_defer).toBeDefined();
		expect(globalThis.__flare_r).toBeUndefined();

		if (q) q.push(["a:k", "ok"]);
		expect(globalThis.__flare_r).toBeUndefined();
		expect(globalThis.__flare_re).toBeUndefined();
		expect(globalThis.__flare_defer).toBeUndefined();
	});

	it("buffered queue drained for both instances", () => {
		/* simulate SSR script that pushed before hydration */
		globalThis.__flare_defer = [
			["a:pre", "buffered-a"],
			["b:pre", "buffered-b"],
		] as Array<[string, unknown, boolean?]>;

		const resolvers1 = new Map<string, DeferredResolver>();
		let resolved1: unknown = null;
		resolvers1.set("a:pre", {
			reject: () => {},
			resolve: (d) => {
				resolved1 = d;
			},
		});

		const resolvers2 = new Map<string, DeferredResolver>();
		let resolved2: unknown = null;
		resolvers2.set("b:pre", {
			reject: () => {},
			resolve: (d) => {
				resolved2 = d;
			},
		});

		installDeferredResolver(resolvers1);
		/* instance 1 drains the queue — picks up a:pre */
		expect(resolved1).toBe("buffered-a");

		installDeferredResolver(resolvers2);
		/* instance 2 drains remaining — picks up b:pre via push proxy from first drain */
		/* b:pre was not resolved by instance 1 (no matching key), so it stays buffered */
		/* When instance 2 installs, it should drain the queue for b:pre */
		expect(resolved2).toBe("buffered-b");
	});
});
