/** @vitest-environment node */
import { QueryClient } from "@tanstack/solid-query";
import { describe, expect, it } from "vitest";
import { hydrateQueryCache, type QueryState } from "../../../src/query-client/index.tsx";
import { serializeQueryClientCache } from "../../../src/ssr/index.tsx";

/**
 * Parse the serialized script tag output back to QueryState[].
 * Reverses the XSS escaping (\u003c → <) via JSON.parse.
 */
function parseScript(script: string): QueryState[] {
	if (!script) return [];
	const json = script.replace(/.*self\.flare\.q=/, "").replace(/;<\/script>$/, "");
	return JSON.parse(json) as QueryState[];
}

/* ── full round-trip: QueryClient → serialize → parse → hydrate ──── */

describe("serialize → hydrate round-trip", () => {
	it("basic data survives round-trip", () => {
		const source = new QueryClient();
		source.setQueryData(["user"], { id: 1, name: "Alice" });

		const script = serializeQueryClientCache(source, "n");
		const entries = parseScript(script);

		const target = new QueryClient();
		hydrateQueryCache(target, entries);
		expect(target.getQueryData(["user"])).toEqual({ id: 1, name: "Alice" });
	});

	it("staleTime survives round-trip", () => {
		const source = new QueryClient();
		source.setQueryData(["timed"], "data");
		source.setQueryDefaults(["timed"], { staleTime: 60_000 });

		/* serializeQueryClientCache reads options.staleTime from cache entries,
		   but real QueryClient stores defaults separately.
		   Simulate by building a mock that has staleTime in options. */
		const mockQC = {
			getQueryCache: () => ({
				getAll: () => [
					{
						options: { staleTime: 60_000 },
						queryKey: ["timed"],
						state: { data: "data" },
					},
				],
			}),
		};

		const script = serializeQueryClientCache(mockQC, "n");
		const entries = parseScript(script);

		const target = new QueryClient();
		hydrateQueryCache(target, entries);
		expect(target.getQueryData(["timed"])).toBe("data");
		expect(target.getQueryDefaults(["timed"])?.staleTime).toBe(60_000);
	});

	it("XSS-escaped data parses back correctly", () => {
		const source = {
			getQueryCache: () => ({
				getAll: () => [
					{
						options: {},
						queryKey: ["html"],
						state: { data: "<script>alert('xss')</script>" },
					},
				],
			}),
		};

		const script = serializeQueryClientCache(source, "n");
		expect(script).toContain("\\u003c");
		const entries = parseScript(script);

		const target = new QueryClient();
		hydrateQueryCache(target, entries);
		expect(target.getQueryData(["html"])).toBe("<script>alert('xss')</script>");
	});

	it("compound keys survive round-trip", () => {
		const source = {
			getQueryCache: () => ({
				getAll: () => [
					{
						options: {},
						queryKey: ["items", "category", 42, true],
						state: { data: { found: true } },
					},
				],
			}),
		};

		const script = serializeQueryClientCache(source, "n");
		const entries = parseScript(script);

		const target = new QueryClient();
		hydrateQueryCache(target, entries);
		expect(target.getQueryData(["items", "category", 42, true])).toEqual({ found: true });
	});

	it("null data survives round-trip", () => {
		const source = {
			getQueryCache: () => ({
				getAll: () => [
					{
						options: {},
						queryKey: ["nullable"],
						state: { data: null },
					},
				],
			}),
		};

		const script = serializeQueryClientCache(source, "n");
		const entries = parseScript(script);

		const target = new QueryClient();
		hydrateQueryCache(target, entries);
		expect(target.getQueryData(["nullable"])).toBeNull();
	});

	it("multiple queries survive round-trip", () => {
		const source = {
			getQueryCache: () => ({
				getAll: () => [
					{ options: { staleTime: 1000 }, queryKey: ["a"], state: { data: 1 } },
					{ options: {}, queryKey: ["b"], state: { data: "two" } },
					{ options: { staleTime: 0 }, queryKey: ["c"], state: { data: [3] } },
				],
			}),
		};

		const script = serializeQueryClientCache(source, "n");
		const entries = parseScript(script);

		const target = new QueryClient();
		hydrateQueryCache(target, entries);
		expect(target.getQueryData(["a"])).toBe(1);
		expect(target.getQueryData(["b"])).toBe("two");
		expect(target.getQueryData(["c"])).toEqual([3]);
		expect(target.getQueryDefaults(["a"])?.staleTime).toBe(1000);
		expect(target.getQueryDefaults(["c"])?.staleTime).toBe(0);
	});

	it("boolean values preserve type through round-trip", () => {
		const source = mockQC([
			{ data: true, queryKey: ["t"] },
			{ data: false, queryKey: ["f"] },
		]);
		const entries = parseScript(serializeQueryClientCache(source, "n"));
		const target = new QueryClient();
		hydrateQueryCache(target, entries);
		expect(target.getQueryData(["t"])).toBe(true);
		expect(target.getQueryData(["f"])).toBe(false);
	});

	it("empty string preserves through round-trip", () => {
		const source = mockQC([{ data: "", queryKey: ["empty"] }]);
		const entries = parseScript(serializeQueryClientCache(source, "n"));
		const target = new QueryClient();
		hydrateQueryCache(target, entries);
		expect(target.getQueryData(["empty"])).toBe("");
	});

	it("zero preserves through round-trip", () => {
		const source = mockQC([{ data: 0, queryKey: ["zero"] }]);
		const entries = parseScript(serializeQueryClientCache(source, "n"));
		const target = new QueryClient();
		hydrateQueryCache(target, entries);
		expect(target.getQueryData(["zero"])).toBe(0);
	});

	it("nested XSS content survives full round-trip", () => {
		const data = {
			content: "<script>alert('evil')</script>",
			items: [{ html: "</script><img src=x onerror=alert(1)>" }],
		};
		const source = mockQC([{ data, queryKey: ["nested-xss"] }]);
		const script = serializeQueryClientCache(source, "n");
		/* JSON payload must not contain raw < */
		const payload = script.replace(/.*self\.flare\.q=/, "").replace(/;<\/script>$/, "");
		expect(payload).not.toContain("<");
		/* but after parsing, original data restored */
		const entries = parseScript(script);
		const target = new QueryClient();
		hydrateQueryCache(target, entries);
		expect(target.getQueryData(["nested-xss"])).toEqual(data);
	});

	it("key with object segments survives round-trip", () => {
		const key = ["items", { filter: "active", page: 1 }];
		const source = mockQC([{ data: "filtered", queryKey: key }]);
		const entries = parseScript(serializeQueryClientCache(source, "n"));
		const target = new QueryClient();
		hydrateQueryCache(target, entries);
		expect(target.getQueryData(["items", { filter: "active", page: 1 }])).toBe("filtered");
	});

	it("deeply nested data survives round-trip", () => {
		const data = {
			level1: {
				level2: {
					level3: {
						items: [
							{ id: 1, tags: ["a", "b"] },
							{ id: 2, tags: [] },
						],
					},
				},
			},
		};
		const source = mockQC([{ data, queryKey: ["deep"] }]);
		const entries = parseScript(serializeQueryClientCache(source, "n"));
		const target = new QueryClient();
		hydrateQueryCache(target, entries);
		expect(target.getQueryData(["deep"])).toEqual(data);
	});

	it("real QueryClient → serialize → hydrate into new client", () => {
		const source = new QueryClient();
		source.setQueryData(["user", 1], { age: 30, name: "Alice" });
		source.setQueryData(["posts"], [{ id: 1, title: "Hello" }]);

		const script = serializeQueryClientCache(source, "nonce");
		const entries = parseScript(script);

		const target = new QueryClient();
		hydrateQueryCache(target, entries);
		expect(target.getQueryData(["user", 1])).toEqual({ age: 30, name: "Alice" });
		expect(target.getQueryData(["posts"])).toEqual([{ id: 1, title: "Hello" }]);
	});

	it("unicode and emoji survive round-trip", () => {
		const data = { emoji: "🎉🔥💯", name: "漢字テスト" };
		const source = mockQC([{ data, queryKey: ["i18n"] }]);
		const entries = parseScript(serializeQueryClientCache(source, "n"));
		const target = new QueryClient();
		hydrateQueryCache(target, entries);
		expect(target.getQueryData(["i18n"])).toEqual(data);
	});

	it("large batch round-trip (200 entries)", () => {
		const items = Array.from({ length: 200 }, (_, i) => ({
			data: { id: i, nested: { value: `v-${i}` } },
			queryKey: ["batch", i],
		}));
		const source = mockQC(items);
		const entries = parseScript(serializeQueryClientCache(source, "n"));
		expect(entries).toHaveLength(200);

		const target = new QueryClient();
		hydrateQueryCache(target, entries);
		expect(target.getQueryData(["batch", 0])).toEqual({ id: 0, nested: { value: "v-0" } });
		expect(target.getQueryData(["batch", 199])).toEqual({ id: 199, nested: { value: "v-199" } });
	});
});

/* ── helper for round-trip tests ───────────────────────────────────── */

function mockQC(entries: Array<{ data: unknown; queryKey: unknown[]; staleTime?: number }>) {
	return {
		getQueryCache: () => ({
			getAll: () =>
				entries.map((e) => ({
					options: e.staleTime !== undefined ? { staleTime: e.staleTime } : {},
					queryKey: e.queryKey,
					state: { data: e.data },
				})),
		}),
	};
}
