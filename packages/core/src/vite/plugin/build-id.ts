import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import type { Plugin } from "vite"
import { defined } from "../../shared/errors/index.ts"
import { clientUrl, PRERENDER_ENV, type Urls } from "./environments.ts"
import { preloadsOf } from "./preloads.ts"

type ManifestEntry = { file: string; css?: readonly string[]; imports?: readonly string[]; isDynamicEntry?: boolean }
type Manifest = Readonly<Record<string, ManifestEntry>>

// What the server build holds in place of its id until the bundle is known: 12 characters, as the id is, so swapping
// it in moves no byte a sourcemap points at.
export const ID_PLACEHOLDER = "__FLARE_ID__"

// The first 12 hex digits of sha256 over what ships and runs: the sorted, deduped, root-relative JS and CSS URLs of
// the client manifest, read from `file` and `css` only, then each server JS chunk's file name and final code, with the
// placeholder where the id goes. A sourcemap and anything else the build emits beside the code are not read, so the
// same app gives the same id wherever it is built, and a server-only change gives a new one (B84, plan 21 3.1).
export function buildIdOf(manifest: Manifest, chunks: ReadonlyArray<{ fileName: string; code: string }>): string {
	const urls = new Set(Object.values(manifest).flatMap((entry) => [entry.file, ...(entry.css ?? [])]))
	const list = [...urls].map((file) => `/${file}`).sort()
	const hash = createHash("sha256").update(list.join("\n"))
	for (const chunk of [...chunks].sort((a, b) => (a.fileName < b.fileName ? -1 : 1))) {
		hash.update(`\0${chunk.fileName}\0${chunk.code}`)
	}
	return hash.digest("hex").slice(0, 12)
}

type Bundle = Record<string, { type: string; fileName: string; code?: string }>

// Both server builds write the placeholder. Once its chunks are final, the ssr build, the one that serves, hashes
// them with the client manifest and writes the id over it; the prerender build, which follows, writes that same id,
// so a prerendered page and the server agree (B84, plan 21 3.1).
export function buildIdPlugin(state: { manifest: string; buildId?: string }): Plugin {
	return {
		name: "flare:build-id",
		generateBundle: {
			order: "post",
			handler(_options, bundle) {
				const { name, config } = this.environment
				// A server bundle without the build info module, one that serves no document, has nothing to stamp.
				const holds = chunksOf(bundle).some((chunk) => chunk.code.includes(ID_PLACEHOLDER))
				if (config.command !== "build" || !holds) return
				if (name === "ssr") state.buildId = buildIdOf(readManifest(state.manifest), chunksOf(bundle))
				if (name === "ssr" || name === PRERENDER_ENV) stamp(bundle, defined(state.buildId, "the ssr build's id"))
			},
		},
	}
}

function chunksOf(bundle: Bundle): Array<{ fileName: string; code: string }> {
	return Object.values(bundle).flatMap((file) =>
		file.type === "chunk" && file.code !== undefined ? [{ fileName: file.fileName, code: file.code }] : [],
	)
}

function stamp(bundle: Bundle, id: string): void {
	for (const file of Object.values(bundle))
		if (file.code !== undefined) file.code = file.code.replaceAll(ID_PLACEHOLDER, id)
}

function readManifest(path: string): Manifest {
	let text: string
	try {
		text = readFileSync(path, "utf8")
	} catch {
		throw new Error(`The client manifest ${path} is missing: the client build must run before the server build`)
	}
	return JSON.parse(text)
}

// `devHead` is what `transformIndexHtml` adds to an empty document, which every dev runtime's documents carry (B95 (b)).
export type BuildInfoInput = {
	command: "serve" | "build"
	entry: string
	manifest: string
	urls: Urls
	devHead: string
}

// The source of server/lifecycle/build-info.ts in the ssr and flare_prerender environments. Dev has the project-relative
// entry and the `dev` id. A build has the manifest's hashed entry and the placeholder `buildIdPlugin` writes the id
// over.
export function buildInfoSource(input: BuildInfoInput): string {
	const dev = input.command === "serve"
	const manifest = dev ? undefined : readManifest(input.manifest)
	const id = manifest === undefined ? "dev" : ID_PLACEHOLDER
	const entry = clientUrl(
		manifest === undefined ? { entry: input.entry } : { entry: input.entry, manifest, urls: input.urls },
	)
	const head = dev ? input.devHead : ""
	const preloads = manifest === undefined ? { entry: [], routes: {} } : preloadsOf(manifest, input.entry, input.urls)
	return `export const buildId = ${JSON.stringify(id)};\nexport const clientEntry = ${JSON.stringify(entry)};\nexport const devHead = ${JSON.stringify(head)};\nexport const preloads = ${JSON.stringify(preloads)};\n`
}
