import { readFileSync } from "node:fs"
import { basename, join } from "node:path"
import { afterAll, beforeAll, expect, it } from "vitest"
import { packCore, type Packed } from "../../../../scripts/release.ts"

// Each public entry's packed `.d.ts` is the API an app compiles against. A change to it is a commit of its own.
let packed: Packed

beforeAll(() => {
	packed = packCore()
}, 240_000)

afterAll(() => packed?.close())

it("snapshot", async () => {
	const exports: Record<string, unknown> = Object(Reflect.get(packed.manifest, "exports"))
	const entries = Object.entries(exports).filter(([key, value]) => typeof value === "object" && !key.includes("*"))
	expect(entries.length).toBeGreaterThan(10)
	for (const [, value] of entries) {
		const types = String(Reflect.get(Object(value), "types"))
		const name = basename(types, ".d.ts")
		await expect(readFileSync(join(packed.root, types), "utf8")).toMatchFileSnapshot(`snapshots/${name}.txt`)
	}
})

// The packed `./worker` keeps its throwing module: the entry re-exports the worker binding, which the package's
// `sideEffects: false` cannot drop as it drops a bare re-export, so a plain Node import names why it fails (B109).
it("worker outside vite", async () => {
	const worker = String(Reflect.get(Object(Reflect.get(Object(packed.manifest), "exports"))["./worker"], "default"))
	await expect(import(join(packed.root, worker))).rejects.toThrow("runs only inside Vite with flare()")
})
