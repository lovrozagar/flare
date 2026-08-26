import { describe, expect, it, vi } from "vitest";

const hydrateSpy = vi.hoisted(() => vi.fn());

vi.mock("../../../src/query-client", () => ({
	hydrateQueryCache: hydrateSpy,
}));

import { applyQueryCacheHydration, fetchNDJSON } from "../../../src/ndjson-client/index.ts";

function createMockResponse(lines: string[]): Response {
	const body = `${lines.join("\n")}\n`;
	const encoder = new TextEncoder();
	const encoded = encoder.encode(body);
	let read = false;
	return {
		body: {
			getReader: () => ({
				cancel: vi.fn(),
				read: vi.fn(() => {
					if (!read) {
						read = true;
						return { done: false, value: encoded };
					}
					return { done: true, value: undefined };
				}),
			}),
		},
		headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "application/x-ndjson" : null) },
		ok: true,
		status: 200,
	} as unknown as Response;
}

describe("NDJSON t:q query hydration", () => {
	it("skips hydrateQueryCache when the nav signal is already aborted", async () => {
		hydrateSpy.mockClear();
		const ac = new AbortController();
		ac.abort();
		applyQueryCacheHydration({}, [{ data: 1, key: ["todos"] }], ac.signal);
		await Promise.resolve();
		await Promise.resolve();
		expect(hydrateSpy).not.toHaveBeenCalled();
	});

	it("hydrates when the signal is live", async () => {
		hydrateSpy.mockClear();
		applyQueryCacheHydration({}, [{ data: 1, key: ["todos"] }]);
		await vi.waitFor(() => {
			expect(hydrateSpy).toHaveBeenCalled();
		});
	});

	it("fetchNDJSON t:q hydrates while the signal is live", async () => {
		hydrateSpy.mockClear();
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(createMockResponse([JSON.stringify({ d: [{ data: 1, key: ["q"] }], t: "q" })])),
		);
		await fetchNDJSON({ queryClient: {}, url: "/data" });
		await vi.waitFor(() => {
			expect(hydrateSpy).toHaveBeenCalled();
		});
		vi.unstubAllGlobals();
	});
});
