/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest";
import type { CdnPurgeAdapter, RevalidateFn, RevalidateOptions } from "../../../src/revalidation/index.ts";
import { createRevalidateFn, revalidate } from "../../../src/revalidation/index.ts";
import { runWithServerContext } from "../../../src/server-context/index.ts";
import type { FlareStore } from "../../../src/store/index.ts";

/* ── helpers ──────────────────────────────────────────────────────── */

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

/* ── createRevalidateFn ──────────────────────────────────────────── */

describe("createRevalidateFn", () => {
	it("purges ssr tier by tags", async () => {
		const store = makeStore();
		const fn = createRevalidateFn({ store });

		await fn({ tags: ["products"], tiers: ["ssr"] });

		expect(store.deleteByTags).toHaveBeenCalledWith(["products"], undefined);
	});

	it("purges ssr tier by keys when deleteByKeys is available", async () => {
		const deleteByKeys = vi.fn(async () => {});
		const store = makeStore({ deleteByKeys });
		const fn = createRevalidateFn({ store });

		await fn({ keys: ["GET:/products/1"], tiers: ["ssr"] });

		expect(deleteByKeys).toHaveBeenCalledWith(["GET:/products/1"], undefined);
	});

	it("falls back to individual delete when deleteByKeys not available", async () => {
		const store = makeStore();
		const fn = createRevalidateFn({ store });

		await fn({ keys: ["key1", "key2"], tiers: ["ssr"] });

		expect(store.delete).toHaveBeenCalledTimes(2);
		expect(store.delete).toHaveBeenCalledWith("key1");
		expect(store.delete).toHaveBeenCalledWith("key2");
	});

	it("purges CDN by tags", async () => {
		const cdn = makeCdnAdapter();
		const fn = createRevalidateFn({ cdnPurgeAdapter: cdn });

		await fn({ tags: ["products"], tiers: ["cdn"] });

		expect(cdn.purgeByTags).toHaveBeenCalledWith(["products"], undefined);
	});

	it("purges CDN by keys when purgeByKeys available", async () => {
		const purgeByKeys = vi.fn(async () => {});
		const cdn = makeCdnAdapter({ purgeByKeys });
		const fn = createRevalidateFn({ cdnPurgeAdapter: cdn });

		await fn({ keys: ["key1"], tiers: ["cdn"] });

		expect(purgeByKeys).toHaveBeenCalledWith(["key1"], undefined);
	});

	it("purges both tiers in parallel", async () => {
		const store = makeStore();
		const cdn = makeCdnAdapter();
		const fn = createRevalidateFn({ cdnPurgeAdapter: cdn, store });

		await fn({ tags: ["products"], tiers: ["ssr", "cdn"] });

		expect(store.deleteByTags).toHaveBeenCalledWith(["products"], undefined);
		expect(cdn.purgeByTags).toHaveBeenCalledWith(["products"], undefined);
	});

	it("passes callerData to adapters", async () => {
		const store = makeStore();
		const cdn = makeCdnAdapter();
		const fn = createRevalidateFn({ cdnPurgeAdapter: cdn, store });
		const callerData = { source: "webhook" };

		await fn({ callerData, tags: ["products"], tiers: ["ssr", "cdn"] });

		expect(store.deleteByTags).toHaveBeenCalledWith(["products"], callerData);
		expect(cdn.purgeByTags).toHaveBeenCalledWith(["products"], callerData);
	});

	it("throws when ssr tier requested but no store configured", async () => {
		const fn = createRevalidateFn({});

		await expect(fn({ tags: ["x"], tiers: ["ssr"] })).rejects.toThrow(/ssr.*not configured/i);
	});

	it("throws when cdn tier requested but no CDN adapter configured", async () => {
		const fn = createRevalidateFn({});

		await expect(fn({ tags: ["x"], tiers: ["cdn"] })).rejects.toThrow(/cdn.*not configured/i);
	});

	it("handles both tags and keys in single call", async () => {
		const deleteByKeys = vi.fn(async () => {});
		const store = makeStore({ deleteByKeys });
		const fn = createRevalidateFn({ store });

		await fn({
			keys: ["GET:/products/1"],
			tags: ["products"],
			tiers: ["ssr"],
		});

		expect(store.deleteByTags).toHaveBeenCalledWith(["products"], undefined);
		expect(deleteByKeys).toHaveBeenCalledWith(["GET:/products/1"], undefined);
	});

	it("no-ops when no tags and no keys provided", async () => {
		const store = makeStore();
		const fn = createRevalidateFn({ store });

		await fn({ tiers: ["ssr"] });

		expect(store.deleteByTags).not.toHaveBeenCalled();
		expect(store.delete).not.toHaveBeenCalled();
	});
});

/* ── importable revalidate() via ALS ────────────────────────────── */

describe("importable revalidate()", () => {
	it("works within server context (ALS)", async () => {
		const store = makeStore();

		await runWithServerContext(
			{
				nonce: "test",
				request: new Request("http://localhost"),
				store,
			},
			async () => {
				await revalidate({ tags: ["products"], tiers: ["ssr"] });
				expect(store.deleteByTags).toHaveBeenCalledWith(["products"], undefined);
			},
		);
	});

	it("throws outside server context", async () => {
		await expect(revalidate({ tags: ["x"], tiers: ["ssr"] })).rejects.toThrow(/ssr.*not configured/i);
	});
});

/* ── type smoke ──────────────────────────────────────────────────── */

describe("revalidation types", () => {
	it("RevalidateOptions accepts ssr and cdn tiers", () => {
		const opts: RevalidateOptions = { tags: ["x"], tiers: ["ssr", "cdn"] };
		expect(opts.tiers).toEqual(["ssr", "cdn"]);
	});

	it("RevalidateFn signature", () => {
		const fn: RevalidateFn = async (_opts: RevalidateOptions) => {};
		expect(fn).toBeTypeOf("function");
	});

	it("CdnPurgeAdapter has purgeByTags, optional purgeByKeys", () => {
		const adapter: CdnPurgeAdapter = {
			purgeByTags: async () => {},
		};
		expect(adapter.purgeByTags).toBeTypeOf("function");
		expect(adapter.purgeByKeys).toBeUndefined();
	});
});
