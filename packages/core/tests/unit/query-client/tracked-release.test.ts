/** @vitest-environment node */
import { QueryClient } from "@tanstack/solid-query";
import { describe, expect, it } from "vitest";
import { createTrackedQueryClient } from "../../../src/query-client/index.tsx";

describe("createTrackedQueryClient release()", () => {
	it("stops tracking after release", () => {
		const qc = new QueryClient();
		const tracked = createTrackedQueryClient(qc);

		qc.setQueryData(["a"], "one");
		expect(tracked.getTrackedQueries()).toHaveLength(1);

		tracked.release();
		qc.setQueryData(["b"], "two");
		expect(tracked.getTrackedQueries()).toHaveLength(1);
	});

	it("a second tracker after release does not see prior writes", () => {
		const qc = new QueryClient();
		const first = createTrackedQueryClient(qc);
		qc.setQueryData(["old"], 1);
		first.release();

		const second = createTrackedQueryClient(qc);
		qc.setQueryData(["new"], 2);
		expect(second.getTrackedQueries()).toHaveLength(1);
		expect(second.getTrackedQueries()[0]?.key).toEqual(["new"]);
		second.release();
	});

	it("release is idempotent", () => {
		const qc = new QueryClient();
		const tracked = createTrackedQueryClient(qc);
		tracked.release();
		expect(() => tracked.release()).not.toThrow();
		qc.setQueryData(["x"], 1);
		expect(tracked.getTrackedQueries()).toHaveLength(0);
	});
});
