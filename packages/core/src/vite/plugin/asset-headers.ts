import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { Plugin } from "vite"

// The rule for the hashed assets: a file whose name carries its content hash never changes, so the browser keeps it
// without asking again, and what `modules: "all"` or an intent prefetch warmed is not downloaded twice (dx/link.md).
function rule(assetsDir: string): string {
	return `/${assetsDir}/*\n  Cache-Control: public, max-age=31536000, immutable\n`
}

// The `_headers` text with Flare's rule after the app's own rules, or the app's text alone when it already has a rule
// for the assets path: the app's wins (B130).
export function assetHeaders(existing: string | undefined, assetsDir: string): { text: string; conflict: boolean } {
	const own = rule(assetsDir)
	if (existing === undefined) return { text: own, conflict: false }
	const path = `/${assetsDir}/*`
	if (existing.split("\n").some((line) => line.trim() === path)) return { text: existing, conflict: true }
	return { text: `${existing.trimEnd()}\n\n${own}`, conflict: false }
}

// The Workers assets binding serves the client output and reads its `_headers` (B130). Flare writes that deploy output
// when the app composes the Cloudflare plugin, so it adds the rule there, after Vite copied the app's public dir, whose
// own `_headers` is kept and extended. A Node or Bun app's files are its host's to serve (dx/link.md).
export function assetHeadersPlugin(cloudflare: () => boolean): Plugin {
	let warned = false
	return {
		name: "flare:asset-headers",
		writeBundle() {
			const { name, config } = this.environment
			if (name !== "client" || !cloudflare()) return
			const path = resolve(config.root, config.build.outDir, "_headers")
			const { text, conflict } = assetHeaders(
				existsSync(path) ? readFileSync(path, "utf8") : undefined,
				config.build.assetsDir,
			)
			if (!conflict) return writeFileSync(path, text)
			if (warned) return
			warned = true
			this.warn(
				`_headers already has a /${config.build.assetsDir}/* rule; the app's is kept, without Flare's immutable one`,
			)
		},
	}
}
