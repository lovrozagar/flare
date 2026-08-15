import { afterEach, describe, expect, it } from "vitest";
import type { DeferredResolver } from "../../../src/state-parser/index.ts";
import { installDeferredResolver } from "../../../src/state-parser/index.ts";

function cleanGlobals() {
	globalThis.__flare_r = undefined;
	globalThis.__flare_re = undefined;
	globalThis.__flare_q = undefined;
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
		expect(globalThis.__flare_r).toBeDefined();

		globalThis.__flare_r?.("m1:title", "hello");
		expect(resolved).toBe("hello");
		expect(resolvers.size).toBe(0);

		/* globals cleaned after all resolved */
		expect(globalThis.__flare_r).toBeUndefined();
		expect(globalThis.__flare_re).toBeUndefined();
		expect(globalThis.__flare_q).toBeUndefined();
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
		globalThis.__flare_re?.("m1:data", "boom");
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

		/* resolve instance 2's key */
		globalThis.__flare_r?.("b:y", "two");
		expect(resolved2).toBe("two");

		/* resolve instance 1's key — must still work after instance 2 installed */
		globalThis.__flare_r?.("a:x", "one");
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
		const q = globalThis.__flare_q;
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

		/* drain instance 2 */
		globalThis.__flare_r?.("b:k", "ok");
		/* instance 1 still has pending — globals must remain */
		expect(globalThis.__flare_r).toBeDefined();

		/* drain instance 1 */
		globalThis.__flare_r?.("a:k", "ok");
		/* both drained — globals should be cleaned */
		expect(globalThis.__flare_r).toBeUndefined();
		expect(globalThis.__flare_re).toBeUndefined();
		expect(globalThis.__flare_q).toBeUndefined();
	});

	it("buffered queue drained for both instances", () => {
		/* simulate SSR script that pushed before hydration */
		globalThis.__flare_q = [
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
