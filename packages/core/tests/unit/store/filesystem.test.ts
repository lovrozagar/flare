/** @vitest-environment node */
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { FlareStoreEntry } from "../../../src/store/index.ts"
import { createFileSystemStore, keyToPath } from "../../../src/store/filesystem.ts"

let cacheDir: string

beforeEach(() => {
	cacheDir = mkdtempSync(join(tmpdir(), "flare-fs-store-"))
})

afterEach(() => {
	rmSync(cacheDir, { force: true, recursive: true })
})

describe("keyToPath", () => {
	it("static:/about → static/about.json", () => {
		expect(keyToPath("static:/about")).toBe("static/_about.json")
	})

	it("static:/ → static/_.json (root)", () => {
		expect(keyToPath("static:/")).toBe("static/_.json")
	})

	it("handles loader keys with params", () => {
		const result = keyToPath('flare:_root_/[id]:{"id":"42"}')
		expect(result).toMatch(/^loader\//)
		expect(result).toMatch(/\.json$/)
	})

	it("handles unicode in keys", () => {
		const result = keyToPath("static:/über")
		expect(result).toMatch(/^static\//)
		expect(result).toMatch(/\.json$/)
	})

	it("handles deeply nested paths", () => {
		const result = keyToPath("static:/a/b/c/d")
		expect(result).toBe("static/_a_b_c_d.json")
	})
})

describe("createFileSystemStore", () => {
	it("get/set round-trip", async () => {
		const store = createFileSystemStore({ cacheDir })
		const entry: FlareStoreEntry = {
			data: { title: "hello" },
			storedAt: Date.now(),
			tags: ["page"],
		}
		await store.set("static:/about", entry)
		const result = await store.get("static:/about")
		expect(result).toEqual(entry)
	})

	it("get nonexistent → null", async () => {
		const store = createFileSystemStore({ cacheDir })
		const result = await store.get("static:/nope")
		expect(result).toBeNull()
	})

	it("TTL expiration", async () => {
		const store = createFileSystemStore({ cacheDir })
		const entry: FlareStoreEntry = {
			data: { title: "expires" },
			storedAt: Date.now(),
		}
		await store.set("static:/ttl", entry, 1)

		/* immediately should be present */
		expect(await store.get("static:/ttl")).not.toBeNull()

		/* fast-forward time past TTL */
		vi.useFakeTimers()
		vi.setSystemTime(Date.now() + 2000)
		expect(await store.get("static:/ttl")).toBeNull()
		vi.useRealTimers()
	})

	it("delete removes entry", async () => {
		const store = createFileSystemStore({ cacheDir })
		const entry: FlareStoreEntry = { data: "x", storedAt: Date.now() }
		await store.set("static:/del", entry)
		expect(await store.get("static:/del")).not.toBeNull()
		await store.delete("static:/del")
		expect(await store.get("static:/del")).toBeNull()
	})

	it("deleteByTags removes matching entries", async () => {
		const store = createFileSystemStore({ cacheDir })
		await store.set("static:/a", { data: "a", storedAt: Date.now(), tags: ["t1"] })
		await store.set("static:/b", { data: "b", storedAt: Date.now(), tags: ["t2"] })
		await store.set("static:/c", { data: "c", storedAt: Date.now(), tags: ["t1", "t2"] })

		await store.deleteByTags(["t1"])

		expect(await store.get("static:/a")).toBeNull()
		expect(await store.get("static:/b")).not.toBeNull()
		expect(await store.get("static:/c")).toBeNull()
	})

	it("deleteByKeys removes specific entries", async () => {
		const store = createFileSystemStore({ cacheDir })
		await store.set("static:/x", { data: "x", storedAt: Date.now() })
		await store.set("static:/y", { data: "y", storedAt: Date.now() })

		await store.deleteByKeys?.(["static:/x"])

		expect(await store.get("static:/x")).toBeNull()
		expect(await store.get("static:/y")).not.toBeNull()
	})

	it("auto-creates directories", async () => {
		const nested = join(cacheDir, "sub", "deep")
		const store = createFileSystemStore({ cacheDir: nested })
		await store.set("static:/auto", { data: "ok", storedAt: Date.now() })
		expect(await store.get("static:/auto")).not.toBeNull()
	})

	it("concurrent writes don't corrupt", async () => {
		const store = createFileSystemStore({ cacheDir })
		const writes = Array.from({ length: 20 }, (_, i) =>
			store.set(`static:/concurrent-${i}`, { data: `val-${i}`, storedAt: Date.now() }),
		)
		await Promise.all(writes)
		for (let i = 0; i < 20; i++) {
			const result = await store.get(`static:/concurrent-${i}`)
			expect(result?.data).toBe(`val-${i}`)
		}
	})

	it("overwrite existing entry", async () => {
		const store = createFileSystemStore({ cacheDir })
		await store.set("static:/ow", { data: "v1", storedAt: Date.now() })
		await store.set("static:/ow", { data: "v2", storedAt: Date.now() })
		const result = await store.get("static:/ow")
		expect(result?.data).toBe("v2")
	})

	it("delete nonexistent key is a no-op", async () => {
		const store = createFileSystemStore({ cacheDir })
		await expect(store.delete("static:/ghost")).resolves.toBeUndefined()
	})

	it("deleteByTags with no matches is a no-op", async () => {
		const store = createFileSystemStore({ cacheDir })
		await store.set("static:/z", { data: "z", storedAt: Date.now(), tags: ["keep"] })
		await store.deleteByTags(["nonexistent"])
		expect(await store.get("static:/z")).not.toBeNull()
	})
})
