import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createFilesystemStore } from "./store.ts";

let dir = "";

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "flare-fs-store-"));
});

afterEach(async () => {
	vi.restoreAllMocks();
	vi.useRealTimers();
	await rm(dir, { recursive: true, force: true });
});

const entry = { data: { html: "<p>a</p>" }, storedAt: 1, tags: ["t"] };

// With no argument the directory is `.flare/cache` under the process cwd.
it("dir", async () => {
	vi.spyOn(process, "cwd").mockReturnValue(dir);
	const store = createFilesystemStore();
	await store.set("k", entry);
	expect(await readdir(join(dir, ".flare", "cache"))).toEqual(["k.json"]);
	expect(await store.get("k")).toEqual(entry);
	expect(await store.get("missing")).toBeNull();
});

// One file per key, and keys that differ only in `/` and `_` stay two files.
it("no collision", async () => {
	const store = createFilesystemStore({ dir });
	await store.set("a/b", { ...entry, data: "slash" });
	await store.set("a_b", { ...entry, data: "underscore" });
	expect((await readdir(dir)).toSorted()).toHaveLength(2);
	expect((await store.get("a/b"))?.data).toBe("slash");
	expect((await store.get("a_b"))?.data).toBe("underscore");
});

it("backslash", async () => {
	const store = createFilesystemStore({ dir });
	await expect(store.set("a\\b", entry)).rejects.toThrow(/backslash/);
	expect(await readdir(dir)).toEqual([]);
});

// A key the filesystem would truncate throws. The store never shortens a name.
it("long key", async () => {
	const store = createFilesystemStore({ dir });
	await expect(store.set("k".repeat(300), entry)).rejects.toThrow(/too long/);
	expect(await readdir(dir)).toEqual([]);
});

// `ttl` expires the entry, `delete` writes a tombstone, and a tag delete bumps the tag's epoch, never a listing.
it("ttl and purge", async () => {
	vi.useFakeTimers({ now: 0, toFake: ["Date"] });
	const store = createFilesystemStore({ dir });
	await store.set("k", entry, 1000);
	vi.setSystemTime(1000);
	expect(await store.get("k")).toBeNull();
	await store.delete("k");
	expect(await store.get("k")).toEqual({ data: { tombstone: true }, storedAt: 1000 });
	await store.deleteByKeys?.(["j"]);
	expect((await store.get("j"))?.data).toEqual({ tombstone: true });
	await store.deleteByTags(["t"]);
	expect((await store.get("epoch:t"))?.data).toBe(1000);
});

// A file that is missing is a miss. Any other read failure is the caller's.
it("unreadable", async () => {
	await mkdir(join(dir, "k.json"));
	await expect(createFilesystemStore({ dir }).get("k")).rejects.toThrow(/EISDIR/);
});
