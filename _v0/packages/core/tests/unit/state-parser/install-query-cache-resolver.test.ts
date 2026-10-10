/** @vitest-environment jsdom */
import { QueryClient } from "@tanstack/solid-query";
import { afterEach, describe, expect, it } from "vitest";
import { installQueryCacheResolver } from "../../../src/state-parser/index.ts";

declare global {
	var __flare_queries: Array<[unknown]> | { push: (entry: [unknown]) => number } | undefined;
}

afterEach(() => {
	globalThis.__flare_queries = undefined;
});

describe("installQueryCacheResolver", () => {
	it("drains buffered __flare_queries entries and hydrates query cache", () => {
		const qc = new QueryClient();

		/* simulate SSR scripts that arrived before hydration */
		globalThis.__flare_queries = [
			[{ data: { name: "item-a" }, key: ["a"], staleTime: 5000 }],
			[{ data: { name: "item-b" }, key: ["b"] }],
		];

		installQueryCacheResolver(qc);

		expect(qc.getQueryData(["a"])).toEqual({ name: "item-a" });
		expect(qc.getQueryData(["b"])).toEqual({ name: "item-b" });
	});

	it("installs push-proxy for late-arriving SSR script entries", () => {
		const qc = new QueryClient();
		installQueryCacheResolver(qc);

		/* simulate a late SSR script pushing after hydration */
		const proxy = globalThis.__flare_queries as { push: (entry: [unknown]) => number };
		proxy.push([{ data: "late-value", key: ["late-key"] }]);

		expect(qc.getQueryData(["late-key"])).toBe("late-value");
	});

	it("handles empty buffer gracefully", () => {
		const qc = new QueryClient();
		globalThis.__flare_queries = [];
		installQueryCacheResolver(qc);
		/* no crash, proxy installed */
		expect(globalThis.__flare_queries).toBeDefined();
	});

	it("handles no buffer (undefined) gracefully", () => {
		const qc = new QueryClient();
		globalThis.__flare_queries = undefined;
		installQueryCacheResolver(qc);
		expect(globalThis.__flare_queries).toBeDefined();
	});

	it("preserves staleTime from streamed entries", () => {
		const qc = new QueryClient();
		globalThis.__flare_queries = [[{ data: "val", key: ["st-key"], staleTime: 60000 }]];

		installQueryCacheResolver(qc);

		const defaults = qc.getQueryDefaults(["st-key"]);
		expect(defaults?.staleTime).toBe(60000);
	});
});
