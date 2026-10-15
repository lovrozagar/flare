import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it } from "vitest"
import { createAssetsStore } from "../../server/cache/assets.ts"
import { createMemoryStore } from "../../server/cache/memory.ts"
import { createRevalidateFn } from "../../server/cache/revalidate.ts"
import { artifactPath } from "../../shared/cache/artifact-path.ts"
import { seedBase } from "../plugin/environments.ts"
import { writeSeed } from "./artifacts.ts"

const dirs: string[] = []

afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function client(): string {
	const dir = mkdtempSync(join(tmpdir(), "flare-seeds-"))
	dirs.push(dir)
	return dir
}

const entry = { data: { html: "<p>about</p>" }, storedAt: 1234, tags: ["posts"] }

it("seed shape", async () => {
	const dir = client()
	const file = await writeSeed({ clientDir: dir, assetsBase: "/assets", key: "static:b:_root_/about", entry })
	expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({
		seed: true,
		key: "static:b:_root_/about",
		renderedAt: 1234,
		tags: ["posts"],
		data: { html: "<p>about</p>" },
	})
})

// The file is where `artifactPath` says, under the client output: the only path formatter (dx/store.md).
it("path", async () => {
	const dir = client()
	const file = await writeSeed({ clientDir: dir, assetsBase: "/assets", key: "static:b:_root_/about", entry })
	const hex = createHash("sha256").update("_root_/about").digest("hex")
	expect(file).toBe(join(dir, "assets/_flare-static/b", `${hex}.json`))
	expect(file).toBe(join(dir, (await artifactPath("static:b:_root_/about", { build: "b" })) ?? ""))
	// The assets store a Node server of that build reads seeds with finds it.
	await writeSeed({ clientDir: dir, assetsBase: "/assets", key: "static:dev:_root_/about", entry })
	const store = createAssetsStore(async (path) => readFileSync(join(dir, path)), { base: seedBase("/assets") })
	expect(await store.get("static:dev:_root_/about")).toEqual({ data: entry.data, tags: ["posts"], storedAt: 1234 })
	await expect(writeSeed({ clientDir: dir, assetsBase: "/assets", key: "epoch:posts", entry })).rejects.toThrow(
		/epoch:posts/,
	)
})

it("base follows assets", async () => {
	const dir = client()
	const file = await writeSeed({ clientDir: dir, assetsBase: "/cdn", key: "static:b:_root_/about", entry })
	expect(file.startsWith(join(dir, "cdn/_flare-static/b/"))).toBe(true)
	const root = await writeSeed({ clientDir: dir, assetsBase: "/", key: "static:b:_root_/about", entry })
	expect(root.startsWith(join(dir, "assets/_flare-static/b/"))).toBe(true)
})

// A route that declares no tags still writes its seed, with `tags: []`. A tag purge does not delete it.
it("empty tags", async () => {
	const dir = client()
	const file = await writeSeed({
		clientDir: dir,
		assetsBase: "/assets",
		key: "static:b:_root_/plain",
		entry: { data: "x", storedAt: 1 },
	})
	expect(JSON.parse(readFileSync(file, "utf8")).tags).toEqual([])
	await createRevalidateFn(createMemoryStore())({ tags: ["posts"] })
	expect(existsSync(file)).toBe(true)
})
