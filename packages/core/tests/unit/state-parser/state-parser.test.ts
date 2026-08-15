import { afterEach, describe, expect, it } from "vitest";
import type { DeferredResolver } from "../../../src/state-parser/index.ts";
import {
	hydrateFlareState,
	hydrateLoaderData,
	installDeferredResolver,
	isDeferredMarker,
	parseFlareState,
} from "../../../src/state-parser/index.ts";

describe("parseFlareState", () => {
	it("valid FlareState → returns typed FlareState", () => {
		const raw = { c: {}, m: [], p: "/", r: {}, s: {} };
		expect(parseFlareState(raw)).toEqual(raw);
	});

	it("null → returns null", () => {
		expect(parseFlareState(null)).toBeNull();
	});

	it("undefined → returns null", () => {
		expect(parseFlareState(undefined)).toBeNull();
	});

	it("string → returns null", () => {
		expect(parseFlareState("string")).toBeNull();
	});

	it("empty object → returns null", () => {
		expect(parseFlareState({})).toBeNull();
	});

	it("{ c: {}, m: [], p: '/', r: {}, s: {} } → returns FlareState", () => {
		const raw = { c: {}, m: [], p: "/", r: {}, s: {} };
		expect(parseFlareState(raw)).not.toBeNull();
	});

	it("missing c → returns null", () => {
		expect(parseFlareState({ m: [], p: "/", r: {}, s: {} })).toBeNull();
	});

	it("missing m → returns null", () => {
		expect(parseFlareState({ c: {}, p: "/", r: {}, s: {} })).toBeNull();
	});

	it("missing p → returns null", () => {
		expect(parseFlareState({ c: {}, m: [], r: {}, s: {} })).toBeNull();
	});
});

describe("isDeferredMarker", () => {
	it("{ __deferred: true, key: 'd0' } → true", () => {
		expect(isDeferredMarker({ __deferred: true, key: "d0" })).toBe(true);
	});

	it("{ __deferred: true, key: 'reviews' } → true", () => {
		expect(isDeferredMarker({ __deferred: true, key: "reviews" })).toBe(true);
	});

	it("{ __deferred: false, key: 'x' } → false", () => {
		expect(isDeferredMarker({ __deferred: false, key: "x" })).toBe(false);
	});

	it("{ __deferred: true } → false (no key)", () => {
		expect(isDeferredMarker({ __deferred: true })).toBe(false);
	});

	it("{ key: 'x' } → false (no __deferred)", () => {
		expect(isDeferredMarker({ key: "x" })).toBe(false);
	});

	it("null → false", () => {
		expect(isDeferredMarker(null)).toBe(false);
	});

	it("string → false", () => {
		expect(isDeferredMarker("string")).toBe(false);
	});
});

describe("hydrateLoaderData", () => {
	it("primitive → unchanged", () => {
		const resolvers = new Map<string, DeferredResolver>();
		expect(hydrateLoaderData("m1", "hello", resolvers)).toBe("hello");
		expect(hydrateLoaderData("m1", 42, resolvers)).toBe(42);
		expect(hydrateLoaderData("m1", null, resolvers)).toBeNull();
	});

	it("object with no deferred → unchanged", () => {
		const resolvers = new Map<string, DeferredResolver>();
		const data = { a: 1, b: "two" };
		expect(hydrateLoaderData("m1", data, resolvers)).toEqual(data);
	});

	it("object with deferred marker → Deferred with promise, key renamed to __key", () => {
		const resolvers = new Map<string, DeferredResolver>();
		const marker = { __deferred: true, key: "d0" };
		const result = hydrateLoaderData("m1", marker, resolvers) as Record<string, unknown>;
		expect(result.__deferred).toBe(true);
		expect(result.__key).toBe("d0");
		expect(result.promise).toBeInstanceOf(Promise);
		expect(result.key).toBeUndefined();
	});

	it("resolver stored as 'matchId:key'", () => {
		const resolvers = new Map<string, DeferredResolver>();
		hydrateLoaderData("m1", { __deferred: true, key: "d0" }, resolvers);
		expect(resolvers.has("m1:d0")).toBe(true);
	});

	it("nested deferred: { a: { b: marker } }", () => {
		const resolvers = new Map<string, DeferredResolver>();
		const data = { a: { b: { __deferred: true, key: "nested" } } };
		const result = hydrateLoaderData("m1", data, resolvers) as Record<string, Record<string, Record<string, unknown>>>;
		expect(result.a.b.__deferred).toBe(true);
		expect(result.a.b.__key).toBe("nested");
		expect(resolvers.has("m1:nested")).toBe(true);
	});

	it("array with deferred: [marker, 'x']", () => {
		const resolvers = new Map<string, DeferredResolver>();
		const data = [{ __deferred: true, key: "d0" }, "x"];
		const result = hydrateLoaderData("m1", data, resolvers) as unknown[];
		expect((result[0] as Record<string, unknown>).__deferred).toBe(true);
		expect(result[1]).toBe("x");
	});

	it("multiple deferred in same object → each gets resolver", () => {
		const resolvers = new Map<string, DeferredResolver>();
		const data = {
			a: { __deferred: true, key: "d0" },
			b: { __deferred: true, key: "d1" },
		};
		hydrateLoaderData("m1", data, resolvers);
		expect(resolvers.has("m1:d0")).toBe(true);
		expect(resolvers.has("m1:d1")).toBe(true);
	});

	it("same key in different matchIds → different resolver entries", () => {
		const resolvers = new Map<string, DeferredResolver>();
		hydrateLoaderData("m1", { __deferred: true, key: "d0" }, resolvers);
		hydrateLoaderData("m2", { __deferred: true, key: "d0" }, resolvers);
		expect(resolvers.has("m1:d0")).toBe(true);
		expect(resolvers.has("m2:d0")).toBe(true);
		expect(resolvers.size).toBe(2);
	});

	it("filters __proto__ and constructor keys", () => {
		const resolvers = new Map<string, DeferredResolver>();
		const data = JSON.parse('{"__proto__": {"polluted": true}, "constructor": "bad", "safe": "ok"}');
		const result = hydrateLoaderData("m1", data, resolvers) as Record<string, unknown>;
		expect(result.safe).toBe("ok");
		expect(Object.hasOwn(result, "__proto__")).toBe(false);
		expect(Object.hasOwn(result, "constructor")).toBe(false);
		expect(Object.keys(result)).toEqual(["safe"]);
	});
});

describe("hydrateFlareState", () => {
	it("empty matches → { matches: [], resolvers empty }", () => {
		const state = { c: {}, m: [], p: "/", r: {}, s: {} };
		const result = hydrateFlareState(state);
		expect(result.matches).toEqual([]);
		expect(result.resolvers.size).toBe(0);
	});

	it("single match, no deferred → match with original loaderData", () => {
		const state = {
			c: {},
			m: [{ d: { greeting: "hi" }, h: undefined, i: "m1", p: undefined, v: "_root_" }],
			p: "/",
			r: {},
			s: {},
		};
		const result = hydrateFlareState(state);
		expect(result.matches).toHaveLength(1);
		expect(result.matches[0]?.loaderData).toEqual({ greeting: "hi" });
		expect(result.resolvers.size).toBe(0);
	});

	it("single match, one deferred → Deferred with promise, one resolver", () => {
		const state = {
			c: {},
			m: [{ d: { __deferred: true, key: "d0" }, h: undefined, i: "m1", p: undefined, v: "_root_" }],
			p: "/",
			r: {},
			s: {},
		};
		const result = hydrateFlareState(state);
		expect(result.resolvers.size).toBe(1);
		expect(result.resolvers.has("m1:d0")).toBe(true);
	});

	it("multiple matches → each hydrated independently", () => {
		const state = {
			c: {},
			m: [
				{ d: "data1", h: undefined, i: "m1", p: undefined, v: "_root_" },
				{ d: "data2", h: undefined, i: "m2", p: undefined, v: "_root_/page" },
			],
			p: "/page",
			r: {},
			s: {},
		};
		const result = hydrateFlareState(state);
		expect(result.matches).toHaveLength(2);
	});

	it("preserves headConfig from match", () => {
		const state = {
			c: {},
			m: [{ d: null, h: { title: "Page" }, i: "m1", p: undefined, v: "_root_" }],
			p: "/",
			r: {},
			s: {},
		};
		const result = hydrateFlareState(state);
		expect(result.matches[0]?.headConfig).toEqual({ title: "Page" });
	});

	it("preserves preloaderContext from match", () => {
		const state = {
			c: {},
			m: [{ d: null, h: undefined, i: "m1", p: { user: { id: "1" } }, v: "_root_" }],
			p: "/",
			r: {},
			s: {},
		};
		const result = hydrateFlareState(state);
		expect(result.matches[0]?.preloaderContext).toEqual({ user: { id: "1" } });
	});

	it("preserves virtualPath from match", () => {
		const state = {
			c: {},
			m: [{ d: null, h: undefined, i: "m1", p: undefined, v: "_root_/about" }],
			p: "/about",
			r: {},
			s: {},
		};
		const result = hydrateFlareState(state);
		expect(result.matches[0]?.virtualPath).toBe("_root_/about");
	});
});

describe("installDeferredResolver", () => {
	afterEach(() => {
		globalThis.__flare_r = undefined;
		globalThis.__flare_re = undefined;
		globalThis.__flare_q = undefined;
	});

	it("drains buffered queue entries", () => {
		const resolvers = new Map<string, DeferredResolver>();
		let resolved: unknown = null;
		resolvers.set("m1:d0", {
			reject: () => {},
			resolve: (d) => {
				resolved = d;
			},
		});

		globalThis.__flare_q = [["m1:d0", "queued-data"]];
		installDeferredResolver(resolvers);
		expect(resolved).toBe("queued-data");
	});

	it("drains error entries from queue", () => {
		const resolvers = new Map<string, DeferredResolver>();
		let rejected: Error | null = null;
		resolvers.set("m1:d0", {
			reject: (e) => {
				rejected = e;
			},
			resolve: () => {},
		});

		globalThis.__flare_q = [["m1:d0", "fail-msg", true]];
		installDeferredResolver(resolvers);
		expect(rejected).toBeInstanceOf(Error);
		expect((rejected ?? new Error("should not be null")).message).toBe("fail-msg");
	});

	it("cleans up globals after all resolvers settle", () => {
		const resolvers = new Map<string, DeferredResolver>();
		resolvers.set("m1:d0", {
			reject: () => {},
			resolve: () => {},
		});

		installDeferredResolver(resolvers);
		expect(globalThis.__flare_r).toBeDefined();

		/* Resolve the last resolver — globals should be cleaned */
		globalThis.__flare_r?.("m1:d0", "data");
		expect(globalThis.__flare_r).toBeUndefined();
		expect(globalThis.__flare_re).toBeUndefined();
		expect(globalThis.__flare_q).toBeUndefined();
	});

	it("cleans up immediately when no resolvers exist", () => {
		const resolvers = new Map<string, DeferredResolver>();
		installDeferredResolver(resolvers);
		expect(globalThis.__flare_r).toBeUndefined();
		expect(globalThis.__flare_re).toBeUndefined();
	});

	it("late pushes to __flare_q after drain are intercepted", () => {
		const resolvers = new Map<string, DeferredResolver>();
		let resolved: unknown = null;
		resolvers.set("m1:d0", {
			reject: () => {},
			resolve: (d) => {
				resolved = d;
			},
		});

		installDeferredResolver(resolvers);
		/* Simulate SSR script arriving after drain */
		const q = globalThis.__flare_q;
		if (q) q.push(["m1:d0", "late-data"]);
		expect(resolved).toBe("late-data");
	});

	it("late error pushes to __flare_q after drain are intercepted", () => {
		const resolvers = new Map<string, DeferredResolver>();
		let rejected: Error | null = null;
		resolvers.set("m1:d0", {
			reject: (e) => {
				rejected = e;
			},
			resolve: () => {},
		});

		installDeferredResolver(resolvers);
		const q = globalThis.__flare_q;
		if (q) q.push(["m1:d0", "late-error", true]);
		expect(rejected).toBeInstanceOf(Error);
		expect((rejected ?? new Error("should not be null")).message).toBe("late-error");
	});

	it("globals remain while resolvers pending", () => {
		const resolvers = new Map<string, DeferredResolver>();
		resolvers.set("m1:d0", { reject: () => {}, resolve: () => {} });
		resolvers.set("m1:d1", { reject: () => {}, resolve: () => {} });

		installDeferredResolver(resolvers);
		expect(globalThis.__flare_r).toBeDefined();

		/* Resolve only one — globals still alive */
		globalThis.__flare_r?.("m1:d0", "data");
		expect(globalThis.__flare_r).toBeDefined();

		/* Resolve second — now cleaned up */
		globalThis.__flare_r?.("m1:d1", "data2");
		expect(globalThis.__flare_r).toBeUndefined();
	});
});

describe("resolver integration", () => {
	it("calling resolver.resolve(data) resolves the Deferred's promise", async () => {
		const resolvers = new Map<string, DeferredResolver>();
		const result = hydrateLoaderData("m1", { __deferred: true, key: "d0" }, resolvers) as Record<string, unknown>;
		const promise = result.promise as Promise<unknown>;

		const resolver = resolvers.get("m1:d0");
		resolver?.resolve("resolved-data");

		const data = await promise;
		expect(data).toBe("resolved-data");
	});

	it("calling resolver.reject(error) rejects the Deferred's promise", async () => {
		const resolvers = new Map<string, DeferredResolver>();
		const result = hydrateLoaderData("m1", { __deferred: true, key: "d0" }, resolvers) as Record<string, unknown>;
		const promise = result.promise as Promise<unknown>;

		const resolver = resolvers.get("m1:d0");
		resolver?.reject(new Error("fail"));

		await expect(promise).rejects.toThrow("fail");
	});
});
