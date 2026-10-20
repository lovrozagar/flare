import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { lookup } from "../../../server/cache/epoch.ts"
import { createFilesystemStore } from "./store.ts"

// A step to run once, right after the `nth` read of a file named `epoch-…`: the races in `damaged epoch race`.
const hooks = vi.hoisted(() => ({ afterRead: undefined as { nth: number; run: () => Promise<void> } | undefined }))

vi.mock("node:fs/promises", async (importOriginal) => {
	const real = await importOriginal<typeof import("node:fs/promises")>()
	let reads = 0
	const readFile = (async (...args: Parameters<typeof real.readFile>) => {
		const text = await real.readFile(...args)
		const hook = hooks.afterRead
		if (hook !== undefined && String(args[0]).includes("epoch-") && (reads += 1) === hook.nth) {
			hooks.afterRead = undefined
			reads = 0
			await hook.run()
		}
		return text
	}) as typeof real.readFile
	return { ...real, readFile }
})

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

const fileOf = (key: string): string =>
	join(dir, `${key.startsWith("epoch:") ? "epoch-" : ""}${createHash("sha256").update(key).digest("hex")}.json`)

// A page file that does not hold a record, bytes cut short or a shape no store wrote, is logged once, removed, and
// read as a miss, so the next write lands a good one (BUGS.md 394).
it("damaged page", async () => {
	const errors = vi.spyOn(console, "error").mockImplementation(() => undefined)
	const store = createFilesystemStore({ dir })
	for (const text of ["{trunc", "", "null", '{"key":"k"}']) {
		await store.set("k", entry)
		await writeFile(fileOf("k"), text)
		expect([text, await store.get("k"), existsSync(fileOf("k"))]).toEqual([text, null, false])
	}
	await store.set("k", entry)
	expect(await store.get("k")).toEqual(entry)
	expect(errors.mock.calls.map((call) => call.join(" "))).toEqual([
		"[flare:cache] the store held a damaged record for k: read as a miss",
	])
})

// A damaged epoch reads as a purge now, written back good, so a page stored before the read is purged once and the
// tag's next purge reads a number. A page purged before the damage stays purged: the epoch never reads as absent.
it("damaged epoch", async () => {
	vi.spyOn(console, "error").mockImplementation(() => undefined)
	vi.useFakeTimers({ now: 1000, toFake: ["Date"] })
	const store = createFilesystemStore({ dir })
	await store.set("page", { ...entry, storedAt: 1000 })
	vi.setSystemTime(2000)
	await store.deleteByTags(["t"])
	await writeFile(fileOf("epoch:t"), "{trunc")
	vi.setSystemTime(3000)
	expect((await lookup(store, "page"))?.purged).toBe(true)
	expect(JSON.parse(await readFile(fileOf("epoch:t"), "utf8")).entry).toEqual({ data: 3000, storedAt: 3000 })
	await store.set("fresh", { ...entry, storedAt: 3001 })
	expect((await lookup(store, "fresh"))?.purged).toBe(false)
	vi.setSystemTime(4000)
	await expect(store.deleteByTags(["t"])).resolves.toBeUndefined()
	expect((await store.get("epoch:t"))?.data).toBe(4000)
})

// A purge that lands between the damaged read and its rewrite stands: the rewrite reads the file again just before
// its rename, so the epoch never goes back past that purge (BUGS.md 394).
it("damaged epoch race", async () => {
	vi.spyOn(console, "error").mockImplementation(() => undefined)
	vi.useFakeTimers({ now: 1000, toFake: ["Date"] })
	const store = createFilesystemStore({ dir })
	const purgeAt = (at: number) => async () => {
		vi.setSystemTime(at)
		await store.set("epoch:t", { data: at, storedAt: at })
	}
	// A purge before the read again stands as written.
	await writeFile(fileOf("epoch:t"), "{trunc")
	hooks.afterRead = { nth: 1, run: purgeAt(2000) }
	expect([(await store.get("epoch:t"))?.data, (await store.get("epoch:t"))?.data]).toEqual([2000, 2000])
	// A purge after the read again loses to the rewrite's later now, so the epoch never goes back past it.
	await writeFile(fileOf("epoch:t"), "{trunc")
	hooks.afterRead = { nth: 2, run: purgeAt(3000) }
	expect((await store.get("epoch:t"))?.data).toBe(3000)
	expect((await readdir(dir)).filter((name) => name.endsWith(".tmp"))).toEqual([])
	// An epoch file gone by then is written good.
	await writeFile(fileOf("epoch:t"), "{trunc")
	hooks.afterRead = { nth: 1, run: () => rm(fileOf("epoch:t")) }
	expect((await store.get("epoch:t"))?.data).toBe(3000)
	expect(JSON.parse(await readFile(fileOf("epoch:t"), "utf8")).entry.data).toBe(3000)
	// An epoch record that parses but holds no finite number is damaged too, and reads as a purge now.
	for (const entry of [{}, { data: "x" }, { data: null }]) {
		await writeFile(fileOf("epoch:t"), JSON.stringify({ key: "epoch:t", entry, expiresAt: null }))
		expect([entry, (await store.get("epoch:t"))?.data]).toEqual([entry, 3000])
	}
})
