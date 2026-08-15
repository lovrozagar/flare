import { afterEach, describe, expect, it } from "vitest";
import type { DeferredResolver } from "../../../src/state-parser/index.ts";
import {
	hydrateFlareState,
	hydrateLoaderData,
	installDeferredResolver,
	isDeferredMarker,
	parseFlareState,
} from "../../../src/state-parser/index.ts";

/* ── parseFlareState edge cases ──────────────────────────────────── */

describe("parseFlareState edge cases", () => {
	it("null → null", () => {
		expect(parseFlareState(null)).toBeNull();
	});

	it("undefined → null", () => {
		expect(parseFlareState(undefined)).toBeNull();
	});

	it("string → null", () => {
		expect(parseFlareState("hello")).toBeNull();
	});

	it("number → null", () => {
		expect(parseFlareState(42)).toBeNull();
	});

	it("array → null", () => {
		expect(parseFlareState([])).toBeNull();
	});

	it("missing c field → null", () => {
		expect(parseFlareState({ m: [], p: "/", r: {}, s: {} })).toBeNull();
	});

	it("c is null → null", () => {
		expect(parseFlareState({ c: null, m: [], p: "/", r: {}, s: {} })).toBeNull();
	});

	it("missing m field → null", () => {
		expect(parseFlareState({ c: {}, p: "/", r: {}, s: {} })).toBeNull();
	});

	it("m is not array → null", () => {
		expect(parseFlareState({ c: {}, m: "nope", p: "/", r: {}, s: {} })).toBeNull();
	});

	it("missing p field → null", () => {
		expect(parseFlareState({ c: {}, m: [], r: {}, s: {} })).toBeNull();
	});

	it("p is number → null", () => {
		expect(parseFlareState({ c: {}, m: [], p: 42, r: {}, s: {} })).toBeNull();
	});

	it("missing r field → null", () => {
		expect(parseFlareState({ c: {}, m: [], p: "/", s: {} })).toBeNull();
	});

	it("r is null → null", () => {
		expect(parseFlareState({ c: {}, m: [], p: "/", r: null, s: {} })).toBeNull();
	});

	it("missing s field → null", () => {
		expect(parseFlareState({ c: {}, m: [], p: "/", r: {} })).toBeNull();
	});

	it("s is null → null", () => {
		expect(parseFlareState({ c: {}, m: [], p: "/", r: {}, s: null })).toBeNull();
	});

	it("valid minimal state → parsed", () => {
		const raw = { c: {}, m: [], p: "/", r: {}, s: {} };
		const result = parseFlareState(raw);
		expect(result).toBe(raw);
	});

	it("extra fields preserved", () => {
		const raw = {
			c: {},
			dk: ["key1"],
			e: [{ message: "err", name: "Error", source: "x" }],
			m: [],
			p: "/",
			r: {},
			s: {},
		};
		const result = parseFlareState(raw);
		expect(result?.dk).toEqual(["key1"]);
	});
});

/* ── isDeferredMarker edge cases ─────────────────────────────────── */

describe("isDeferredMarker edge cases", () => {
	it("null → false", () => {
		expect(isDeferredMarker(null)).toBe(false);
	});

	it("undefined → false", () => {
		expect(isDeferredMarker(undefined)).toBe(false);
	});

	it("string → false", () => {
		expect(isDeferredMarker("hello")).toBe(false);
	});

	it("empty object → false", () => {
		expect(isDeferredMarker({})).toBe(false);
	});

	it("__deferred: false → false", () => {
		expect(isDeferredMarker({ __deferred: false, key: "d0" })).toBe(false);
	});

	it("__deferred: true but missing key → false", () => {
		expect(isDeferredMarker({ __deferred: true })).toBe(false);
	});

	it("__deferred: true, key is number → false", () => {
		expect(isDeferredMarker({ __deferred: true, key: 42 })).toBe(false);
	});

	it("valid marker → true", () => {
		expect(isDeferredMarker({ __deferred: true, key: "d0" })).toBe(true);
	});

	it("valid marker with extra fields → true", () => {
		expect(isDeferredMarker({ __deferred: true, extra: "stuff", key: "d0" })).toBe(true);
	});
});

/* ── hydrateLoaderData edge cases ────────────────────────────────── */

describe("hydrateLoaderData edge cases", () => {
	it("null data → null", () => {
		const resolvers = new Map<string, DeferredResolver>();
		expect(hydrateLoaderData("m1", null, resolvers)).toBeNull();
	});

	it("undefined data → undefined", () => {
		const resolvers = new Map<string, DeferredResolver>();
		expect(hydrateLoaderData("m1", undefined, resolvers)).toBeUndefined();
	});

	it("string data → string", () => {
		const resolvers = new Map<string, DeferredResolver>();
		expect(hydrateLoaderData("m1", "hello", resolvers)).toBe("hello");
	});

	it("number data → number", () => {
		const resolvers = new Map<string, DeferredResolver>();
		expect(hydrateLoaderData("m1", 42, resolvers)).toBe(42);
	});

	it("deferred marker → promise with resolver", () => {
		const resolvers = new Map<string, DeferredResolver>();
		const result = hydrateLoaderData("m1", { __deferred: true, key: "d0" }, resolvers);
		const obj = result as Record<string, unknown>;
		expect(obj.__deferred).toBe(true);
		expect(obj.__key).toBe("d0");
		expect(obj.promise).toBeInstanceOf(Promise);
		expect(resolvers.has("m1:d0")).toBe(true);
	});

	it("resolving deferred through resolver fulfills promise", async () => {
		const resolvers = new Map<string, DeferredResolver>();
		const result = hydrateLoaderData("m1", { __deferred: true, key: "d0" }, resolvers);
		const promise = (result as Record<string, unknown>).promise as Promise<unknown>;

		resolvers.get("m1:d0")?.resolve("resolved-data");
		await expect(promise).resolves.toBe("resolved-data");
	});

	it("rejecting deferred through resolver rejects promise", async () => {
		const resolvers = new Map<string, DeferredResolver>();
		const result = hydrateLoaderData("m1", { __deferred: true, key: "d0" }, resolvers);
		const promise = (result as Record<string, unknown>).promise as Promise<unknown>;

		resolvers.get("m1:d0")?.reject(new Error("fail"));
		await expect(promise).rejects.toThrow("fail");
	});

	it("nested deferred in object → resolver created", () => {
		const resolvers = new Map<string, DeferredResolver>();
		const data = { name: "Product", review: { __deferred: true, key: "d0" } };
		const result = hydrateLoaderData("m1", data, resolvers) as Record<string, unknown>;
		expect(result.name).toBe("Product");
		expect((result.review as Record<string, unknown>).__deferred).toBe(true);
		expect(resolvers.has("m1:d0")).toBe(true);
	});

	it("array with deferred → resolvers created", () => {
		const resolvers = new Map<string, DeferredResolver>();
		const data = [{ __deferred: true, key: "d0" }, "plain", { __deferred: true, key: "d1" }];
		const result = hydrateLoaderData("m1", data, resolvers) as unknown[];
		expect(resolvers.size).toBe(2);
		expect(resolvers.has("m1:d0")).toBe(true);
		expect(resolvers.has("m1:d1")).toBe(true);
		expect(result[1]).toBe("plain");
	});

	it("filters __proto__ key for safety", () => {
		const resolvers = new Map<string, DeferredResolver>();
		/* Object with __proto__ key — should be filtered out */
		const data = JSON.parse('{"__proto__": "evil", "safe": "value"}');
		const result = hydrateLoaderData("m1", data, resolvers) as Record<string, unknown>;
		expect(result.safe).toBe("value");
		expect(Object.hasOwn(result, "__proto__")).toBe(false);
	});

	it("filters constructor key for safety", () => {
		const resolvers = new Map<string, DeferredResolver>();
		const data = JSON.parse('{"constructor": "evil", "safe": "value"}');
		const result = hydrateLoaderData("m1", data, resolvers) as Record<string, unknown>;
		expect(result.safe).toBe("value");
		expect(Object.hasOwn(result, "constructor")).toBe(false);
	});

	it("multiple deferreds with same matchId but different keys", () => {
		const resolvers = new Map<string, DeferredResolver>();
		const data = {
			a: { __deferred: true, key: "d0" },
			b: { __deferred: true, key: "d1" },
		};
		hydrateLoaderData("m1", data, resolvers);
		expect(resolvers.size).toBe(2);
		expect(resolvers.has("m1:d0")).toBe(true);
		expect(resolvers.has("m1:d1")).toBe(true);
	});
});

/* ── hydrateFlareState edge cases ────────────────────────────────── */

describe("hydrateFlareState edge cases", () => {
	it("empty matches array → empty results", () => {
		const result = hydrateFlareState({ c: {}, m: [], p: "/", r: {}, s: {} });
		expect(result.matches).toEqual([]);
		expect(result.resolvers.size).toBe(0);
	});

	it("preserves pathname and params", () => {
		const result = hydrateFlareState({
			c: {},
			m: [{ d: null, i: "m1", v: "_root_" }],
			p: "/products/42",
			r: { id: "42" },
			s: { page: "2" },
		});
		expect(result.pathname).toBe("/products/42");
		expect(result.params).toEqual({ id: "42" });
		expect(result.search).toEqual({ page: "2" });
	});

	it("preserves headConfig and preloaderContext", () => {
		const result = hydrateFlareState({
			c: {},
			m: [
				{
					d: null,
					h: { title: "Test" },
					i: "m1",
					p: { userId: "123" },
					v: "_root_",
				},
			],
			p: "/",
			r: {},
			s: {},
		});
		expect(result.matches[0]?.headConfig).toEqual({ title: "Test" });
		expect(result.matches[0]?.preloaderContext).toEqual({ userId: "123" });
	});

	it("creates resolvers for deferred markers in match data", () => {
		const result = hydrateFlareState({
			c: {},
			m: [
				{
					d: { review: { __deferred: true, key: "d0" } },
					i: "m1",
					v: "_root_",
				},
			],
			p: "/",
			r: {},
			s: {},
		});
		expect(result.resolvers.size).toBe(1);
		expect(result.resolvers.has("m1:d0")).toBe(true);
	});
});

/* ── installDeferredResolver edge cases ──────────────────────────── */

describe("installDeferredResolver edge cases", () => {
	afterEach(() => {
		globalThis.__flare_r = undefined;
		globalThis.__flare_re = undefined;
		globalThis.__flare_q = undefined;
	});

	it("empty resolvers map → immediately cleans up globals", () => {
		const resolvers = new Map<string, DeferredResolver>();
		installDeferredResolver(resolvers);
		expect(globalThis.__flare_r).toBeUndefined();
		expect(globalThis.__flare_re).toBeUndefined();
		expect(globalThis.__flare_q).toBeUndefined();
	});

	it("drains buffered queue entries", () => {
		const resolvers = new Map<string, DeferredResolver>();
		let resolvedData: unknown;
		resolvers.set("m1:d0", {
			reject: () => {},
			resolve: (d) => {
				resolvedData = d;
			},
		});

		/* Simulate SSR script that already pushed to queue */
		globalThis.__flare_q = [["m1:d0", "buffered-data"]];

		installDeferredResolver(resolvers);
		expect(resolvedData).toBe("buffered-data");
		expect(resolvers.size).toBe(0);
	});

	it("drains buffered error entries", () => {
		const resolvers = new Map<string, DeferredResolver>();
		let rejectedError: Error | undefined;
		resolvers.set("m1:d0", {
			reject: (e) => {
				rejectedError = e;
			},
			resolve: () => {},
		});

		globalThis.__flare_q = [["m1:d0", "error message", true]];

		installDeferredResolver(resolvers);
		expect(rejectedError?.message).toBe("error message");
	});

	it("live resolver for late-arriving chunks", () => {
		const resolvers = new Map<string, DeferredResolver>();
		let resolvedData: unknown;
		resolvers.set("m1:d0", {
			reject: () => {},
			resolve: (d) => {
				resolvedData = d;
			},
		});

		installDeferredResolver(resolvers);

		/* Simulate late SSR script push */
		const q = globalThis.__flare_q as { push: (entry: [string, unknown, boolean?]) => number };
		q.push(["m1:d0", "late-data"]);
		expect(resolvedData).toBe("late-data");
	});

	it("live resolver for late error chunks", () => {
		const resolvers = new Map<string, DeferredResolver>();
		let rejectedError: Error | undefined;
		resolvers.set("m1:d0", {
			reject: (e) => {
				rejectedError = e;
			},
			resolve: () => {},
		});

		installDeferredResolver(resolvers);

		const q = globalThis.__flare_q as { push: (entry: [string, unknown, boolean?]) => number };
		q.push(["m1:d0", "late error", true]);
		expect(rejectedError?.message).toBe("late error");
	});

	it("resolver for nonexistent key is no-op", () => {
		const resolvers = new Map<string, DeferredResolver>();
		resolvers.set("m1:d0", {
			reject: () => {},
			resolve: () => {},
		});

		globalThis.__flare_q = [["m1:nonexistent", "data"]];

		installDeferredResolver(resolvers);
		/* m1:d0 still present because nothing resolved it */
		expect(resolvers.has("m1:d0")).toBe(true);
	});

	it("multiple resolvers drained in order", () => {
		const resolvers = new Map<string, DeferredResolver>();
		const resolved: string[] = [];
		resolvers.set("m1:d0", {
			reject: () => {},
			resolve: (d) => {
				resolved.push(d as string);
			},
		});
		resolvers.set("m1:d1", {
			reject: () => {},
			resolve: (d) => {
				resolved.push(d as string);
			},
		});

		globalThis.__flare_q = [
			["m1:d0", "first"],
			["m1:d1", "second"],
		];

		installDeferredResolver(resolvers);
		expect(resolved).toEqual(["first", "second"]);
	});
});
