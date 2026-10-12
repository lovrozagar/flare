import { afterEach, expect, it, vi } from "vitest";
import { createMemoryStore } from "./memory.ts";
import { createRevalidateFn } from "./revalidate.ts";
import { isTombstone } from "./tombstone.ts";

afterEach(() => {
	vi.useRealTimers();
});

// A purge `get` is the tombstone, not null, so a build-time seed stays hidden behind it (B86).
it("delete writes", async () => {
	vi.useFakeTimers({ now: 5000 });
	const store = createMemoryStore();
	await store.set("k", { data: { html: "<p>a</p>" }, storedAt: 1 });
	await store.delete("k");
	const purged = await store.get("k");
	expect(purged).toEqual({ data: { tombstone: true }, storedAt: 5000 });
	expect(isTombstone(purged)).toBe(true);
	await store.deleteByKeys?.(["j"]);
	expect(isTombstone(await store.get("j"))).toBe(true);
	expect(isTombstone({ data: { html: "" }, storedAt: 1 })).toBe(false);
	expect(isTombstone({ data: null, storedAt: 1 })).toBe(false);
	expect(isTombstone(null)).toBe(false);
});

// A key purge writes a tombstone for each key, through `deleteByKeys` when the store has one, else `delete`.
it("key purge", async () => {
	vi.useFakeTimers({ now: 7000 });
	const store = createMemoryStore();
	await store.set("k", { data: { html: "a" }, storedAt: 1 });
	await createRevalidateFn(store)({ keys: ["k"] });
	expect(await store.get("k")).toEqual({ data: { tombstone: true }, storedAt: 7000 });
	const single = createMemoryStore();
	const remove = vi.fn<(key: string) => Promise<void>>(single.delete);
	const plain = { get: single.get, set: single.set, delete: remove, deleteByTags: single.deleteByTags };
	await createRevalidateFn(plain)({ keys: ["a", "b"] });
	expect(remove.mock.calls).toEqual([["a"], ["b"]]);
	expect(isTombstone(await single.get("b"))).toBe(true);
});
