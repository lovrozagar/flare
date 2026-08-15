/** @vitest-environment node */
import { QueryClient } from "@tanstack/solid-query";
import { describe, expect, it } from "vitest";
import { createTrackedQueryClient } from "../../../src/query-client/index.tsx";

describe("createTrackedQueryClient — staleTime capture", () => {
	it("T1: captures staleTime from query defaults", () => {
		const qc = new QueryClient();
		qc.setQueryDefaults(["with-stale"], { staleTime: 30_000 });

		const tracked = createTrackedQueryClient(qc);
		tracked.client.setQueryData(["with-stale"], "value");

		const queries = tracked.getTrackedQueries();
		expect(queries).toHaveLength(1);
		expect(queries[0].staleTime).toBe(30_000);
	});

	it("T2: undefined staleTime when no defaults set", () => {
		const qc = new QueryClient();
		const tracked = createTrackedQueryClient(qc);
		tracked.client.setQueryData(["no-defaults"], "value");

		const queries = tracked.getTrackedQueries();
		expect(queries[0].staleTime).toBeUndefined();
	});

	it("T3: staleTime=0 captured correctly", () => {
		const qc = new QueryClient();
		qc.setQueryDefaults(["zero-stale"], { staleTime: 0 });

		const tracked = createTrackedQueryClient(qc);
		tracked.client.setQueryData(["zero-stale"], "value");

		expect(tracked.getTrackedQueries()[0].staleTime).toBe(0);
	});

	it("T4: non-number staleTime stored as undefined", () => {
		const qc = new QueryClient();
		qc.setQueryDefaults(["str-stale"], { staleTime: "invalid" as unknown as number });

		const tracked = createTrackedQueryClient(qc);
		tracked.client.setQueryData(["str-stale"], "value");

		expect(tracked.getTrackedQueries()[0].staleTime).toBeUndefined();
	});

	it("T5: tracks key as a copy (not reference)", () => {
		const qc = new QueryClient();
		const tracked = createTrackedQueryClient(qc);

		const key = ["mutable", "key"];
		tracked.client.setQueryData(key, "value");
		key.push("modified");

		const queries = tracked.getTrackedQueries();
		expect(queries[0].key).toEqual(["mutable", "key"]);
		expect(queries[0].key).not.toContain("modified");
	});

	it("T6: tracks result from setQueryData (may differ from input)", () => {
		const qc = new QueryClient();
		const tracked = createTrackedQueryClient(qc);

		tracked.client.setQueryData(["result-test"], (old: unknown) => (old === undefined ? "initialized" : old));

		const queries = tracked.getTrackedQueries();
		expect(queries[0].data).toBe("initialized");
	});

	it("T7: multiple setQueryData calls with same key all tracked", () => {
		const qc = new QueryClient();
		const tracked = createTrackedQueryClient(qc);

		tracked.client.setQueryData(["key"], "v1");
		tracked.client.setQueryData(["key"], "v2");
		tracked.client.setQueryData(["key"], "v3");

		const queries = tracked.getTrackedQueries();
		expect(queries).toHaveLength(3);
		expect(queries.map((q) => q.data)).toEqual(["v1", "v2", "v3"]);
	});

	it("T8: client reference is the same wrapped client", () => {
		const qc = new QueryClient();
		const tracked = createTrackedQueryClient(qc);
		expect(tracked.client).toBe(qc);
	});
});
