import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createFilesystemStore } from "./store.ts"

let dir = ""

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "flare-fs-store-"))
})

afterEach(async () => {
	vi.restoreAllMocks()
	vi.useRealTimers()
	await rm(dir, { recursive: true, force: true })
})

const entry = { data: { html: "<p>a</p>" }, storedAt: 1, tags: ["t"] }

// With no argument the directory is `.flare/cache` under the process cwd, read through `process.cwd()` on every
// runtime: Bun's `path.resolve` reads the native cwd instead, so a bare relative resolve would write outside the temp
// dir (BUGS.md B46).
it("dir", async () => {
	const real = process.cwd()
	vi.spyOn(process, "cwd").mockReturnValue(dir)
	const store = createFilesystemStore()
	await store.set("k", entry)
	const file = `${createHash("sha256").update("k").digest("hex")}.json`
	expect(existsSync(join(real, ".flare", "cache", file))).toBe(false)
	expect(await readdir(join(dir, ".flare", "cache"))).toEqual([file])
	expect(await store.get("k")).toEqual(entry)
	expect(await store.get("missing")).toBeNull()
})

// One file per key, and keys that differ only in `/` and `_` stay two files.
it("no collision", async () => {
	const store = createFilesystemStore({ dir })
	await store.set("a/b", { ...entry, data: "slash" })
	await store.set("a_b", { ...entry, data: "underscore" })
	expect((await readdir(dir)).toSorted()).toHaveLength(2)
	expect((await store.get("a/b"))?.data).toBe("slash")
	expect((await store.get("a_b"))?.data).toBe("underscore")
})

// The file name is the SHA-256 hex of the key, so no key character reaches the file system.
it("backslash", async () => {
	const store = createFilesystemStore({ dir })
	await store.set("a\\b", entry)
	expect(await store.get("a\\b")).toEqual(entry)
	expect(await readdir(dir)).toEqual([expect.stringMatching(/^[0-9a-f]{64}\.json$/)])
})

// A long key is stored whole, under a 64-character name. Nothing is truncated.
it("long key", async () => {
	const store = createFilesystemStore({ dir })
	const key = "k".repeat(1000)
	await store.set(key, entry)
	expect(await store.get(key)).toEqual(entry)
	expect((await readdir(dir))[0]).toHaveLength(64 + ".json".length)
})

// Keys that differ only in case are two files, so a case-insensitive file system (APFS, NTFS) cannot merge them.
it("case", async () => {
	const store = createFilesystemStore({ dir })
	await store.set("static:b:p:ABC", { ...entry, data: "upper" })
	await store.set("static:b:p:abc", { ...entry, data: "lower" })
	const names = await readdir(dir)
	expect(new Set(names.map((name) => name.toLowerCase())).size).toBe(2)
	expect((await store.get("static:b:p:ABC"))?.data).toBe("upper")
	expect((await store.get("static:b:p:abc"))?.data).toBe("lower")
})

// The record holds its key. A file whose record holds another key is a miss.
it("key check", async () => {
	const store = createFilesystemStore({ dir })
	await store.set("a", entry)
	const [name = ""] = await readdir(dir)
	const record = JSON.parse(await readFile(join(dir, name), "utf8"))
	await writeFile(join(dir, name), JSON.stringify({ ...record, key: "b" }))
	expect(await store.get("a")).toBeNull()
})

// `ttl` expires the entry, `delete` writes a tombstone, and a tag delete bumps the tag's epoch, never a listing.
it("ttl and purge", async () => {
	vi.useFakeTimers({ now: 0, toFake: ["Date"] })
	const store = createFilesystemStore({ dir })
	await store.set("k", entry, 1000)
	vi.setSystemTime(1000)
	expect(await store.get("k")).toBeNull()
	await store.delete("k")
	expect(await store.get("k")).toEqual({ data: { tombstone: true }, storedAt: 1000 })
	await store.deleteByKeys?.(["j"])
	expect((await store.get("j"))?.data).toEqual({ tombstone: true })
	await store.deleteByTags(["t"])
	expect((await store.get("epoch:t"))?.data).toBe(1000)
})

// A file that is missing is a miss. Any other read failure is the caller's.
it("unreadable", async () => {
	await mkdir(join(dir, `${createHash("sha256").update("k").digest("hex")}.json`))
	await expect(createFilesystemStore({ dir }).get("k")).rejects.toThrow(/EISDIR/)
})

// An expired record that nothing reads again is removed too: each write sweeps a few files, so anonymous requests
// over endless slugs cannot fill the disk (BUGS.md 380).
it("expired swept", async () => {
	vi.useFakeTimers({ now: 0, toFake: ["Date"] })
	const store = createFilesystemStore({ dir })
	// A record with no ttl stays, and a file that does not parse stops neither the sweep nor the write.
	await store.set("kept", entry)
	await writeFile(join(dir, "junk.json"), "{")
	for (let index = 0; index < 200; index++) await store.set(`old${index}`, entry, 1)
	vi.setSystemTime(1)
	for (let index = 0; index < 200; index++) await store.set(`new${index}`, entry, 1000)
	await rm(join(dir, "junk.json"))
	const keys = await Promise.all(
		(await readdir(dir)).map(async (name) => JSON.parse(await readFile(join(dir, name), "utf8")).key as string),
	)
	expect(keys.filter((key) => key.startsWith("old"))).toEqual([])
	expect(keys).toHaveLength(201)
})

// Each pass of the sweep removes the oldest-written records until the rest fit `maxBytes`. An epoch record, named
// `epoch-…`, is neither counted nor removed, and a file gone before its stat is skipped (B147, BUGS.md 380).
it("bound", async () => {
	const filler = createFilesystemStore({ dir })
	for (const key of ["a", "b", "c"]) await filler.set(key, entry)
	await filler.deleteByTags(["t"])
	const size = (await stat(join(dir, `${createHash("sha256").update("a").digest("hex")}.json`))).size
	const files = await readdir(dir)
	expect(files.filter((name) => name.startsWith("epoch-"))).toHaveLength(1)
	for (const [index, key] of ["a", "b", "c"].entries()) {
		const at = new Date(Date.UTC(2026, 0, 1, 0, 0, index))
		await utimes(join(dir, `${createHash("sha256").update(key).digest("hex")}.json`), at, at)
	}
	await symlink(join(dir, "gone"), join(dir, "dangling.json"))
	const store = createFilesystemStore({ dir, maxBytes: size * 2 })
	await store.set("d", entry)
	expect([await store.get("a"), await store.get("b"), await store.get("c"), await store.get("d")]).toEqual([
		null,
		entry,
		entry,
		entry,
	])
	expect((await store.get("epoch:t"))?.storedAt).toBeTypeOf("number")
	for (const maxBytes of [0, 1.5, Number.NaN]) {
		expect(() => createFilesystemStore({ dir, maxBytes })).toThrow("createFilesystemStore: maxBytes must be")
	}
})
