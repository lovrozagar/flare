import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import type { Plugin } from "vite"

// The optional peers each feature imports (dx/features.md). An app that uses none of them installs none.
export const FEATURE_PEERS = {
	i18n: ["@formatjs/intl-localematcher", "isbot", "negotiator"],
	image: ["sharp"],
	query: ["@tanstack/solid-query"],
} as const

export type Feature = keyof typeof FEATURE_PEERS

// The package's own files, `src` in the workspace and `dist` once packed: the only importers the guard reads.
const PACKAGE_FILES = fileURLToPath(new URL("../..", import.meta.url))

// Vite resolves a missing optional peer to a stub module that throws when it runs, which a build reports as a missing
// export of that stub.
const STUB = "__vite-optional-peer-dep:"

// The range the package declares for `peer`, from its own manifest.
function rangeOf(peer: string): string {
	const manifest = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8"))
	return String(Reflect.get(Object(manifest.peerDependencies), peer))
}

// A feature used without its peers: one line per missing peer, naming it and the command that installs it at the
// package's range (plan 21 5.5).
export function missingPeers(feature: Feature, missing: readonly string[]): Error {
	const lines = missing.map(
		(peer) => `flare: ${feature} needs ${peer}. Install it: npm install ${peer}@"${rangeOf(peer)}"`,
	)
	return new Error(lines.join("\n"))
}

// Whether `name` resolves from the package's own location, as its own `import(name)` does.
export function canResolve(name: string): boolean {
	try {
		createRequire(import.meta.url).resolve(name)
		return true
	} catch {
		return false
	}
}

function featureOf(source: string): Feature | undefined {
	const entries = Object.entries(FEATURE_PEERS) as [Feature, readonly string[]][]
	return entries.find(([, peers]) => peers.includes(source))?.[0]
}

export type PeerGuardOptions = { image: boolean; has?: (name: string) => boolean }

// The package's import of an optional peer that is not installed fails here, at build and in dev, with every missing
// peer of that feature named, instead of as a stub's missing export or a runtime ERR_MODULE_NOT_FOUND. `flare({ image })`
// needs sharp whether or not an image is imported, so the config that turns it on says so.
export function peerGuard(options: PeerGuardOptions): Plugin {
	const has = options.has ?? canResolve
	return {
		name: "flare:peers",
		enforce: "pre",
		configResolved() {
			if (options.image && !has("sharp")) throw missingPeers("image", ["sharp"])
		},
		async resolveId(source, importer, extra) {
			const feature = featureOf(source)
			if (feature === undefined || importer === undefined || !importer.startsWith(PACKAGE_FILES)) return null
			const resolve = (peer: string) => this.resolve(peer, importer, { ...extra, skipSelf: true })
			const found = await Promise.all(FEATURE_PEERS[feature].map(async (peer) => [peer, await resolve(peer)] as const))
			const missing = found
				.filter(([, resolved]) => resolved === null || resolved.id.startsWith(STUB))
				.map(([peer]) => peer)
			if (missing.length === 0) return resolve(source)
			throw missingPeers(feature, missing)
		},
	}
}
