import { afterEach, describe, expect, it, vi } from "vitest";
import { installQueryCacheResolver } from "../../../src/state-parser/index.ts";

function cleanGlobals() {
	globalThis.__flare_qc = undefined;
}

function createMockQueryClient() {
	return {
		setQueryData: vi.fn(),
		setQueryDefaults: vi.fn(),
	};
}

describe("Task 5: query cache staleTime validation", () => {
	afterEach(cleanGlobals);

	it("valid positive staleTime applied", () => {
		const qc = createMockQueryClient();
		globalThis.__flare_qc = [[{ data: "val", key: ["k1"], staleTime: 5000 }]];
		installQueryCacheResolver(qc);

		expect(qc.setQueryData).toHaveBeenCalledWith(["k1"], "val");
		expect(qc.setQueryDefaults).toHaveBeenCalledWith(["k1"], { staleTime: 5000 });
	});

	it("zero staleTime applied", () => {
		const qc = createMockQueryClient();
		globalThis.__flare_qc = [[{ data: "val", key: ["k2"], staleTime: 0 }]];
		installQueryCacheResolver(qc);

		expect(qc.setQueryData).toHaveBeenCalledWith(["k2"], "val");
		expect(qc.setQueryDefaults).toHaveBeenCalledWith(["k2"], { staleTime: 0 });
	});

	it("undefined staleTime skipped", () => {
		const qc = createMockQueryClient();
		globalThis.__flare_qc = [[{ data: "val", key: ["k3"] }]];
		installQueryCacheResolver(qc);

		expect(qc.setQueryData).toHaveBeenCalledWith(["k3"], "val");
		expect(qc.setQueryDefaults).not.toHaveBeenCalled();
	});

	it("null staleTime skipped", () => {
		const qc = createMockQueryClient();
		globalThis.__flare_qc = [[{ data: "val", key: ["k4"], staleTime: null }]];
		installQueryCacheResolver(qc);

		expect(qc.setQueryData).toHaveBeenCalledWith(["k4"], "val");
		expect(qc.setQueryDefaults).not.toHaveBeenCalled();
	});

	it("NaN staleTime skipped", () => {
		const qc = createMockQueryClient();
		globalThis.__flare_qc = [[{ data: "val", key: ["k5"], staleTime: NaN }]];
		installQueryCacheResolver(qc);

		expect(qc.setQueryData).toHaveBeenCalledWith(["k5"], "val");
		expect(qc.setQueryDefaults).not.toHaveBeenCalled();
	});

	it("Infinity staleTime skipped", () => {
		const qc = createMockQueryClient();
		globalThis.__flare_qc = [[{ data: "val", key: ["k6"], staleTime: Infinity }]];
		installQueryCacheResolver(qc);

		expect(qc.setQueryData).toHaveBeenCalledWith(["k6"], "val");
		expect(qc.setQueryDefaults).not.toHaveBeenCalled();
	});

	it("negative staleTime skipped", () => {
		const qc = createMockQueryClient();
		globalThis.__flare_qc = [[{ data: "val", key: ["k7"], staleTime: -100 }]];
		installQueryCacheResolver(qc);

		expect(qc.setQueryData).toHaveBeenCalledWith(["k7"], "val");
		expect(qc.setQueryDefaults).not.toHaveBeenCalled();
	});

	it("non-number staleTime (string) skipped", () => {
		const qc = createMockQueryClient();
		globalThis.__flare_qc = [[{ data: "val", key: ["k8"], staleTime: "5000" }]];
		installQueryCacheResolver(qc);

		expect(qc.setQueryData).toHaveBeenCalledWith(["k8"], "val");
		expect(qc.setQueryDefaults).not.toHaveBeenCalled();
	});

	it("late push with valid staleTime applied", () => {
		const qc = createMockQueryClient();
		installQueryCacheResolver(qc);

		const q = globalThis.__flare_qc;
		if (q && "push" in q) {
			q.push([{ data: "late", key: ["k9"], staleTime: 3000 }]);
		}

		expect(qc.setQueryData).toHaveBeenCalledWith(["k9"], "late");
		expect(qc.setQueryDefaults).toHaveBeenCalledWith(["k9"], { staleTime: 3000 });
	});

	it("late push with NaN staleTime skipped", () => {
		const qc = createMockQueryClient();
		installQueryCacheResolver(qc);

		const q = globalThis.__flare_qc;
		if (q && "push" in q) {
			q.push([{ data: "late", key: ["k10"], staleTime: NaN }]);
		}

		expect(qc.setQueryData).toHaveBeenCalledWith(["k10"], "late");
		expect(qc.setQueryDefaults).not.toHaveBeenCalled();
	});
});
