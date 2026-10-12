import { expect, it, vi } from "vitest";
import type { FlareStore } from "./contract.ts";
import { epochKey, lookup } from "./epoch.ts";
import { createMemoryStore } from "./memory.ts";
import { createRevalidateFn } from "./revalidate.ts";

// Every store call, by method.
function counted(store: FlareStore): { store: FlareStore; calls: string[] } {
	const calls: string[] = [];
	const spied = new Proxy(store, {
		get(target, name: string) {
			const method: unknown = Reflect.get(target, name);
			if (typeof method !== "function") return method;
			return (...args: unknown[]) => {
				calls.push(name);
				return Reflect.apply(method, target, args);
			};
		},
	});
	return { store: spied, calls };
}

// One get for the key and one for its own epoch, in parallel, then one per tag. There is no list operation and no tag
// index (dx/store.md).
it("get cost", async () => {
	const memory = createMemoryStore();
	await memory.set("k", { data: { html: "a" }, storedAt: 100, tags: ["a", "b"] });
	const { store, calls } = counted(memory);
	expect(await lookup(store, "k")).toEqual({
		entry: { data: { html: "a" }, storedAt: 100, tags: ["a", "b"] },
		purged: false,
	});
	expect(calls).toEqual(["get", "get", "get", "get"]);
});

// An epoch at or after the entry's render start purges it: a purge in that same millisecond may follow the data
// read, and one extra render is the safe cost. An older epoch leaves it.
it("epoch newer", async () => {
	const store = createMemoryStore();
	await store.set("k", { data: { html: "a" }, storedAt: 100, tags: ["a"] });
	await store.set(epochKey("a"), { data: 99, storedAt: 99 });
	expect((await lookup(store, "k"))?.purged).toBe(false);
	await store.set(epochKey("a"), { data: 100, storedAt: 100 });
	expect((await lookup(store, "k"))?.purged).toBe(true);
	expect(await lookup(store, "missing")).toBeNull();
	await store.set("bare", { data: { html: "b" }, storedAt: 1 });
	expect((await lookup(store, "bare"))?.purged).toBe(false);
});

// A tag purge gets and sets `epoch:<tag>`, a number that never goes back. It never calls `deleteByTags` and never
// lists keys: there is no tag index (dx/store.md).
it("tag purge", async () => {
	const memory = createMemoryStore();
	await memory.set(epochKey("later"), { data: Number.MAX_SAFE_INTEGER, storedAt: 1 });
	const deleteByTags = vi.fn<FlareStore["deleteByTags"]>();
	const { store, calls } = counted({ ...memory, deleteByTags });
	await createRevalidateFn(store)({ tags: ["p", "later"] });
	expect(calls.toSorted()).toEqual(["get", "get", "set", "set"]);
	expect(deleteByTags).not.toHaveBeenCalled();
	expect(typeof (await memory.get(epochKey("p")))?.data).toBe("number");
	expect((await memory.get(epochKey("later")))?.data).toBe(Number.MAX_SAFE_INTEGER);
});
