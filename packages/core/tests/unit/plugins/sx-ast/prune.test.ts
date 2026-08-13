/** @vitest-environment node */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createSxAstPlugin } from "../../../../src/plugins/sx-ast/index.ts"
import type { SxAstOptions } from "../../../../src/plugins/sx-ast/index.ts"

/* ── Helpers ──────────────────────────────────────────────────────────── */

interface TransformCtx {
	environment?: { config?: { root?: string } }
}

type SxPlugin = ReturnType<typeof createSxAstPlugin>

function callBuildStart(plugin: SxPlugin, root: string): void {
	const fn = plugin.buildStart as (this: TransformCtx) => void
	fn.call({ environment: { config: { root } } })
}

function callConfigResolved(plugin: SxPlugin): void {
	const fn = plugin.configResolved as (cfg: { command: string; root?: string }) => void
	fn({ command: "build" })
}

function callTransform(plugin: SxPlugin, code: string, id: string): string | null {
	const fn = plugin.transform as (
		this: TransformCtx,
		code: string,
		id: string,
	) => { code: string; map: null } | null
	return fn.call({}, code, id)?.code ?? null
}

function emitAll(plugin: SxPlugin): { css: string; manifestRaw: string | undefined } {
	const emitted: Array<{ fileName: string; source: string }> = []
	const ctx = {
		emitFile(f: { type: string; fileName: string; source: string }) {
			emitted.push(f)
		},
	}
	const gb = plugin.generateBundle as unknown as (this: typeof ctx) => void
	gb.call(ctx)
	return {
		css: emitted.find((f) => f.fileName === "flare-global.css")?.source ?? "",
		manifestRaw: emitted.find((f) => f.fileName === "flare-sx-manifest.json")?.source,
	}
}

function makePlugin(opts?: SxAstOptions): SxPlugin {
	return createSxAstPlugin(opts ?? {})
}

/* ── Fixtures ─────────────────────────────────────────────────────────── */

let tmpRoot: string

beforeEach(() => {
	tmpRoot = mkdtempSync(join(tmpdir(), "flare-prune-"))
})

afterEach(() => {
	if (existsSync(tmpRoot)) rmSync(tmpRoot, { force: true, recursive: true })
})

function writeLibManifest(
	root: string,
	pkgName: string,
	classes: string[],
	subDir?: string,
): void {
	const pkgDir = join(root, "node_modules", pkgName, ...(subDir ? [subDir] : []))
	mkdirSync(pkgDir, { recursive: true })
	/* Use {rules:{}} shape — same as what the plugin emits */
	const rules: Record<string, string> = {}
	for (const cls of classes) rules[cls] = `.${cls} { color: red }`
	writeFileSync(join(pkgDir, "flare-sx-manifest.json"), JSON.stringify({ rules, version: 1 }))
}

/* ── Tests ────────────────────────────────────────────────────────────── */

describe("pruneFromLibManifests — CSS output", () => {
	it("omits lib class from consumer CSS when pruneFromLibManifests: true", () => {
		/* Get the stable hash for color:red from a clean plugin first */
		const probe = makePlugin({})
		callConfigResolved(probe)
		callTransform(probe, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/src/a.tsx")
		const { css: probeCss } = emitAll(probe)
		/* Extract the a1- class name from the probe CSS */
		const m = /a1-[a-z0-9]{8}/.exec(probeCss)
		if (!m) throw new Error("Could not extract class from probe build")
		const libClass = m[0]

		/* Write a lib manifest containing that class into tmp node_modules */
		writeLibManifest(tmpRoot, "my-lib", [libClass])

		/* Build consumer plugin with pruning enabled */
		const consumer = makePlugin({ pruneFromLibManifests: true })
		callConfigResolved(consumer)
		callBuildStart(consumer, tmpRoot)
		callTransform(
			consumer,
			`export default function A() { return <div sx={{ color: "red" }} /> }`,
			"/src/a.tsx",
		)
		const { css } = emitAll(consumer)

		expect(css).not.toContain(libClass)
	})

	it("keeps consumer-only class when it is not in any lib manifest", () => {
		/* margin:16px has a different hash — not in lib's manifest */
		const probe = makePlugin({})
		callConfigResolved(probe)
		callTransform(probe, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/src/a.tsx")
		const { css: probeCss } = emitAll(probe)
		const m = /a1-[a-z0-9]{8}/.exec(probeCss)
		if (!m) throw new Error("Could not extract class from probe build")
		const libClass = m[0]

		writeLibManifest(tmpRoot, "my-lib", [libClass])

		const consumer = makePlugin({ pruneFromLibManifests: true })
		callConfigResolved(consumer)
		callBuildStart(consumer, tmpRoot)
		/* Consumer uses a different sx value */
		callTransform(
			consumer,
			`export default function B() { return <div sx={{ margin: "16px" }} /> }`,
			"/src/b.tsx",
		)
		const { css } = emitAll(consumer)

		expect(css).toContain("margin")
	})

	it("no node_modules dir → pruning is a no-op, CSS emitted normally", () => {
		const consumer = makePlugin({ pruneFromLibManifests: true })
		callConfigResolved(consumer)
		callBuildStart(consumer, tmpRoot) /* tmpRoot has no node_modules */
		callTransform(
			consumer,
			`export default function A() { return <div sx={{ color: "red" }} /> }`,
			"/src/a.tsx",
		)
		const { css } = emitAll(consumer)

		expect(css).toContain("color")
	})

	it("reads dist/flare-sx-manifest.json fallback location", () => {
		const probe = makePlugin({})
		callConfigResolved(probe)
		callTransform(probe, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/src/a.tsx")
		const { css: probeCss } = emitAll(probe)
		const m = /a1-[a-z0-9]{8}/.exec(probeCss)
		if (!m) throw new Error("Could not extract class from probe build")
		const libClass = m[0]

		/* Write at dist/ sub-location */
		writeLibManifest(tmpRoot, "my-lib", [libClass], "dist")

		const consumer = makePlugin({ pruneFromLibManifests: true })
		callConfigResolved(consumer)
		callBuildStart(consumer, tmpRoot)
		callTransform(
			consumer,
			`export default function A() { return <div sx={{ color: "red" }} /> }`,
			"/src/a.tsx",
		)
		const { css } = emitAll(consumer)

		expect(css).not.toContain(libClass)
	})

	it("reads scoped packages (@scope/name)", () => {
		const probe = makePlugin({})
		callConfigResolved(probe)
		callTransform(probe, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/src/a.tsx")
		const { css: probeCss } = emitAll(probe)
		const m = /a1-[a-z0-9]{8}/.exec(probeCss)
		if (!m) throw new Error("Could not extract class from probe build")
		const libClass = m[0]

		writeLibManifest(tmpRoot, "@scope/my-lib", [libClass])

		const consumer = makePlugin({ pruneFromLibManifests: true })
		callConfigResolved(consumer)
		callBuildStart(consumer, tmpRoot)
		callTransform(
			consumer,
			`export default function A() { return <div sx={{ color: "red" }} /> }`,
			"/src/a.tsx",
		)
		const { css } = emitAll(consumer)

		expect(css).not.toContain(libClass)
	})
})

describe("pruneFromLibManifests — manifest output", () => {
	it("omits pruned class from emitted flare-sx-manifest.json rules", () => {
		const probe = makePlugin({})
		callConfigResolved(probe)
		callTransform(probe, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/src/a.tsx")
		const { css: probeCss } = emitAll(probe)
		const m = /a1-[a-z0-9]{8}/.exec(probeCss)
		if (!m) throw new Error("Could not extract class from probe build")
		const libClass = m[0]

		writeLibManifest(tmpRoot, "my-lib", [libClass])

		const consumer = makePlugin({ manifest: true, pruneFromLibManifests: true })
		callConfigResolved(consumer)
		callBuildStart(consumer, tmpRoot)
		callTransform(
			consumer,
			`export default function A() { return <div sx={{ color: "red" }} /> }`,
			"/src/a.tsx",
		)
		const { manifestRaw } = emitAll(consumer)
		expect(manifestRaw).toBeDefined()
		const parsed = JSON.parse(manifestRaw ?? "{}") as { rules: Record<string, string> }
		expect(Object.keys(parsed.rules)).not.toContain(libClass)
	})

	it("without pruning enabled — lib class IS in consumer manifest", () => {
		const probe = makePlugin({})
		callConfigResolved(probe)
		callTransform(probe, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/src/a.tsx")
		const { css: probeCss } = emitAll(probe)
		const m = /a1-[a-z0-9]{8}/.exec(probeCss)
		if (!m) throw new Error("Could not extract class from probe build")
		const libClass = m[0]

		writeLibManifest(tmpRoot, "my-lib", [libClass])

		/* pruneFromLibManifests NOT set */
		const consumer = makePlugin({ manifest: true })
		callConfigResolved(consumer)
		callBuildStart(consumer, tmpRoot)
		callTransform(
			consumer,
			`export default function A() { return <div sx={{ color: "red" }} /> }`,
			"/src/a.tsx",
		)
		const { manifestRaw } = emitAll(consumer)
		const parsed = JSON.parse(manifestRaw ?? "{}") as { rules: Record<string, string> }
		/* Without pruning, overlap exists */
		expect(Object.keys(parsed.rules)).toContain(libClass)
	})
})
