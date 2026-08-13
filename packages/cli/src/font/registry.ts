import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import type { FontEntry } from "./resolve"

const require = createRequire(import.meta.url)

/**
 * Returns the 201 font entries from flare's generated registry.
 */
export function getFontRegistry(): FontEntry[] {
	/* eslint-disable-next-line @typescript-eslint/no-require-imports */
	const mod = require("flare/fonts/registry.gen") as {
		FONT_REGISTRY: FontEntry[]
	}
	return mod.FONT_REGISTRY
}

/**
 * Returns the local-path → CDN-URL map from flare's generated JSON.
 */
export function getFontUrlMap(): Record<string, string> {
	const registryPath = require.resolve("flare/fonts/registry.gen")
	const fontsDir = dirname(registryPath)
	const jsonPath = join(fontsDir, "font-urls.gen.json")
	const raw = readFileSync(jsonPath, "utf-8")
	return JSON.parse(raw) as Record<string, string>
}
