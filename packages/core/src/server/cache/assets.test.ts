import { createHash } from "node:crypto"
import { expect, it, vi } from "vitest"
import { createAssetsStore } from "./assets.ts"

const KEY = "static:dev:_root_/about"
const HASH = createHash("sha256").update("_root_/about").digest("hex")
const PATH = `/assets/_flare-static/dev/${HASH}.json`
const SEED = { seed: true, key: KEY, renderedAt: 1234, tags: ["a"], data: { html: "<html></html>" } }
const ENTRY = { data: SEED.data, tags: ["a"], storedAt: 1234 }

// Workers hands back the ASSETS binding's Response. `storedAt` is the seed's `renderedAt`.
it("workers read", async () => {
	const read = vi.fn<(path: string) => Promise<Response>>(async () => Response.json(SEED))
	expect(await createAssetsStore(read).get(KEY)).toEqual(ENTRY)
	expect(read).toHaveBeenCalledWith(PATH)
})

// Node hands back the file bytes from fileAssets.
const readFile = async (): Promise<Uint8Array> => new TextEncoder().encode(JSON.stringify(SEED))

it("node read", async () => {
	expect(await createAssetsStore(readFile).get(KEY)).toEqual(ENTRY)
})

// A Response that is not ok is a miss, and its body is cancelled. A missing file is a miss, not a 500.
it("not ok", async () => {
	const cancel = vi.fn<() => void>()
	const body = new ReadableStream({ cancel })
	expect(await createAssetsStore(async () => new Response(body, { status: 404 })).get(KEY)).toBeNull()
	expect(cancel).toHaveBeenCalledOnce()
	expect(await createAssetsStore(async () => null).get(KEY)).toBeNull()
	expect(await createAssetsStore(async () => undefined).get(KEY)).toBeNull()
	expect(await createAssetsStore(async () => new Response(null, { status: 404 })).get(KEY)).toBeNull()
})

it("other build", async () => {
	const read = vi.fn<(path: string) => Promise<null>>(async () => null)
	expect(await createAssetsStore(read).get("static:other:_root_/about")).toBeNull()
	expect(read).not.toHaveBeenCalled()
})

// JSON that does not parse, or a seed the checker refuses, is a miss and not a throw.
it("bad seed", async () => {
	const unflagged = { ...SEED, seed: false }
	expect(await createAssetsStore(async () => Response.json(unflagged)).get(KEY)).toBeNull()
	expect(await createAssetsStore(async () => new Response("{nope")).get(KEY)).toBeNull()
	// A seed holds its key. One written for another key is a miss.
	expect(await createAssetsStore(async () => Response.json({ ...SEED, key: "static:dev:other" })).get(KEY)).toBeNull()
})

it("read only", async () => {
	const store = createAssetsStore(async () => null)
	const entry = { data: 1, storedAt: 1 }
	await expect(store.set(KEY, entry)).rejects.toThrow(/read-only/)
	await expect(store.delete(KEY)).rejects.toThrow(/read-only/)
	await expect(store.deleteByKeys?.([KEY]) ?? Promise.resolve()).rejects.toThrow(/read-only/)
	await expect(store.deleteByTags(["a"])).rejects.toThrow(/read-only/)
})

it("custom base", async () => {
	const read = vi.fn<(path: string) => Promise<null>>(async () => null)
	await createAssetsStore(read, { base: "/cdn/_flare-static" }).get(KEY)
	expect(read).toHaveBeenCalledWith(`/cdn/_flare-static/dev/${HASH}.json`)
})

// A base that would point anywhere but one fixed directory throws when the store is created.
it("bad base", () => {
	for (const base of ["/a/../b", "/a?x=1", "/a#x", "/a/", "a"]) {
		expect(() => createAssetsStore(async () => null, { base })).toThrow(/base/)
	}
})

// A seed ships with the deploy and never changes, so a key's read, hit or miss, is kept: a second get reads nothing
// and parses nothing. The 512 latest keys are kept, the oldest go first, and a read that throws is not kept, so the
// next get reads again (plan 21 15.2).
it("kept reads", async () => {
	const read = vi.fn<typeof readFile>(readFile)
	const store = createAssetsStore(read)
	const first = await store.get(KEY)
	expect(await store.get(KEY)).toBe(first)
	expect(read).toHaveBeenCalledOnce()
	for (let index = 0; index < 512; index++) await store.get(`static:dev:_root_/p${index}`)
	expect(read).toHaveBeenCalledTimes(513)
	await store.get(KEY)
	expect(read).toHaveBeenCalledTimes(514)
	const flaky = vi.fn<() => Promise<Uint8Array>>(async () => {
		throw new Error("disk")
	})
	const failing = createAssetsStore(flaky)
	await expect(failing.get(KEY)).rejects.toThrow("disk")
	await expect(failing.get(KEY)).rejects.toThrow("disk")
	expect(flaky).toHaveBeenCalledTimes(2)
})
