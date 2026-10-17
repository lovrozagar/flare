import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { gzipSync } from "node:zlib"

export type WorkerModule = { type: "ESModule"; path: string }

// Every module of the unbundled Workers output, its main first, as `wrangler deploy` uploads them.
export function modulesOf(dir: string, main: string): WorkerModule[] {
	const files = readdirSync(dir, { recursive: true, encoding: "utf8" })
		.map((file) => join(dir, file))
		.filter((path) => /\.m?js$/.test(path) && path !== main)
	return [main, ...files.toSorted()].map((path) => ({ type: "ESModule", path }))
}

// What `wrangler deploy` uploads, gzipped as Cloudflare counts it against the Workers free plan's 3 MiB script limit
// (plan 21 5.6).
export const UPLOAD_LIMIT = 3 * 1024 * 1024

export function uploadedSize(modules: readonly WorkerModule[]): number {
	return modules.reduce((sum, module) => sum + gzipSync(readFileSync(module.path)).length, 0)
}
