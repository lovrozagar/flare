import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { artifactPath } from "../../shared/cache/artifact-path.ts"
import type { PrerenderEntry } from "../../shared/protocol/prerender.ts"
import { seedBase } from "../plugin/environments.ts"

export type SeedInput = { clientDir: string; assetsBase: string; key: string; entry: PrerenderEntry }

// One seed, `{ seed: true, key, renderedAt, tags, data }`, at the path `artifactPath` gives under the client output
// (dx/store.md). `renderedAt` is the shared render's start, and a route that declares no tags writes `[]`. Returns the
// file written.
export async function writeSeed(input: SeedInput): Promise<string> {
	const build = /^static:([^:]+):/.exec(input.key)?.[1]
	const path = build === undefined ? null : await artifactPath(input.key, { build, base: seedBase(input.assetsBase) })
	if (path === null) throw new Error(`${input.key} is not a page key, so it has no seed`)
	const file = join(input.clientDir, path)
	await mkdir(dirname(file), { recursive: true })
	const { entry } = input
	const seed = { seed: true, key: input.key, renderedAt: entry.storedAt, tags: entry.tags ?? [], data: entry.data }
	await writeFile(file, JSON.stringify(seed))
	return file
}
