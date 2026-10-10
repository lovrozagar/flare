/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest";
import type { CdnPurgeAdapter } from "../../../src/revalidation/index.ts";
import { createRevalidateFn } from "../../../src/revalidation/index.ts";
import type { FlareStore } from "../../../src/store/index.ts";

function makeStore(overrides?: Partial<FlareStore>): FlareStore {
	return {
		delete: vi.fn(async () => {}),
		deleteByTags: vi.fn(async () => {}),
		get: vi.fn(async () => null),
		set: vi.fn(async () => {}),
		...overrides,
	};
}

function makeCdnAdapter(overrides?: Partial<CdnPurgeAdapter>): CdnPurgeAdapter {
	return {
		purgeByTags: vi.fn(async () => {}),
		...overrides,
	};
}

describe("Bug 46: revalidation error isolation", () => {
	it("should still call CDN purge when store.deleteByTags fails", async () => {
		const store = makeStore({
			deleteByTags: vi.fn(async () => {
				throw new Error("Store failure");
			}),
		});
		const cdn = makeCdnAdapter();
		const fn = createRevalidateFn({ cdnPurgeAdapter: cdn, store });

		/* Should throw AggregateError but CDN purge should still complete */
		await expect(fn({ tags: ["products"], tiers: ["ssr", "cdn"] })).rejects.toThrow();

		/* CDN purge should have been called and completed */
		expect(cdn.purgeByTags).toHaveBeenCalledWith(["products"], undefined);
	});

	it("should still delete from store when CDN purge fails", async () => {
		const store = makeStore();
		const cdn = makeCdnAdapter({
			purgeByTags: vi.fn(async () => {
				throw new Error("CDN failure");
			}),
		});
		const fn = createRevalidateFn({ cdnPurgeAdapter: cdn, store });

		await expect(fn({ tags: ["products"], tiers: ["ssr", "cdn"] })).rejects.toThrow();

		/* Store delete should have completed */
		expect(store.deleteByTags).toHaveBeenCalledWith(["products"], undefined);
	});

	it("should aggregate errors from both tiers into AggregateError", async () => {
		const store = makeStore({
			deleteByTags: vi.fn(async () => {
				throw new Error("Store failure");
			}),
		});
		const cdn = makeCdnAdapter({
			purgeByTags: vi.fn(async () => {
				throw new Error("CDN failure");
			}),
		});
		const fn = createRevalidateFn({ cdnPurgeAdapter: cdn, store });

		try {
			await fn({ tags: ["products"], tiers: ["ssr", "cdn"] });
			expect.unreachable("Should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(AggregateError);
			const agg = e as AggregateError;
			expect(agg.errors).toHaveLength(2);
		}

		/* Both operations should have been attempted */
		expect(store.deleteByTags).toHaveBeenCalled();
		expect(cdn.purgeByTags).toHaveBeenCalled();
	});
});
