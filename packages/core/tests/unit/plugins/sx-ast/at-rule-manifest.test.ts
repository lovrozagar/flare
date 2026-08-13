/** @vitest-environment node */
import { describe, expect, it } from "vitest"
import { createSxAstPlugin } from "../../../../src/plugins/sx-ast/index.ts"
import { buildCriticalCss } from "../../../../src/ssr/critical-css.ts"
import type { SxCssManifest } from "../../../../src/ssr/critical-css.ts"

function makeCtx() {
	const emitted: Array<{ fileName: string; source: string }> = []
	return {
		ctx: {
			emitFile(file: { fileName: string; source: string }) {
				emitted.push(file)
			},
		},
		emitted,
	}
}

describe("sx-ast — at-rule-wrapped rules stored under class key in manifest", () => {
	it("@media-wrapped rule keyed by class name, not at-rule string", async () => {
		const plugin = createSxAstPlugin({ manifest: true })

		/* Switch to prod mode so class names are deterministic a1-* hashes */
		const configResolved = plugin.configResolved as (c: { command: string }) => void
		configResolved({ command: "build" })

		const transform = plugin.transform as (
			this: object,
			code: string,
			id: string,
		) => { code: string; map: null } | null

		/* @media wraps the at-rule around the atomic rule */
		transform.call(
			{},
			`export default function A() { return <div sx={{ "@media (min-width: 1px)": { padding: "24px" } }} /> }`,
			"/src/A.tsx",
		)

		const { ctx, emitted } = makeCtx()
		const genBundle = plugin.generateBundle as unknown as (
			this: typeof ctx,
			options: object,
			bundle: object,
		) => void
		genBundle.call(ctx, {}, {})

		const manifestAsset = emitted.find((f) => f.fileName === "flare-sx-manifest.json")
		expect(manifestAsset).toBeDefined()
		if (!manifestAsset) return

		const manifest = JSON.parse(manifestAsset.source) as {
			rules: Record<string, string>
		}

		const keys = Object.keys(manifest.rules)
		/* Every key must be a bare class name, not an at-rule string */
		for (const key of keys) {
			expect(key).not.toMatch(/^@/)
			expect(key).toMatch(/^a1-[a-z0-9]{8}$/)
		}

		/* The stored rule value must contain the @media wrapper */
		const rule = Object.values(manifest.rules)[0]
		expect(rule).toContain("@media")
		expect(rule).toContain("padding")
	})

	it("buildCriticalCss finds at-rule-wrapped class and returns full wrapped CSS", async () => {
		const plugin = createSxAstPlugin({ manifest: true })

		const configResolved = plugin.configResolved as (c: { command: string }) => void
		configResolved({ command: "build" })

		const transform = plugin.transform as (
			this: object,
			code: string,
			id: string,
		) => { code: string; map: null } | null

		const result = transform.call(
			{},
			`export default function A() { return <div sx={{ "@media (min-width: 768px)": { padding: "24px" } }} /> }`,
			"/src/B.tsx",
		)
		expect(result).not.toBeNull()
		if (!result) return

		/* Extract the class name the transform assigned */
		const classMatch = result.code.match(/class="(a1-[a-z0-9]{8})"/)
		expect(classMatch).not.toBeNull()
		if (!classMatch) return
		const cls = classMatch[1]

		const { ctx, emitted } = makeCtx()
		const genBundle = plugin.generateBundle as unknown as (
			this: typeof ctx,
			options: object,
			bundle: object,
		) => void
		genBundle.call(ctx, {}, {})

		const manifestAsset = emitted.find((f) => f.fileName === "flare-sx-manifest.json")
		expect(manifestAsset).toBeDefined()
		if (!manifestAsset) return

		const manifest = JSON.parse(manifestAsset.source) as SxCssManifest

		/* The class must be findable in manifest.rules */
		expect(manifest.rules[cls]).toBeDefined()
		expect(manifest.rules[cls]).toContain("@media")

		/* buildCriticalCss must include the full wrapped at-rule in its output */
		const html = `<div class="${cls}"></div>`
		const { css } = buildCriticalCss(html, [], manifest)
		expect(css).toContain("@media")
		expect(css).toContain("padding")
	})

	it("@supports-wrapped rule keyed by class name", async () => {
		const plugin = createSxAstPlugin({ manifest: true })

		const configResolved = plugin.configResolved as (c: { command: string }) => void
		configResolved({ command: "build" })

		const transform = plugin.transform as (
			this: object,
			code: string,
			id: string,
		) => { code: string; map: null } | null

		transform.call(
			{},
			`export default function A() { return <div sx={{ "@supports (display: grid)": { display: "grid" } }} /> }`,
			"/src/C.tsx",
		)

		const { ctx, emitted } = makeCtx()
		const genBundle = plugin.generateBundle as unknown as (
			this: typeof ctx,
			options: object,
			bundle: object,
		) => void
		genBundle.call(ctx, {}, {})

		const manifestAsset = emitted.find((f) => f.fileName === "flare-sx-manifest.json")
		expect(manifestAsset).toBeDefined()
		if (!manifestAsset) return

		const manifest = JSON.parse(manifestAsset.source) as { rules: Record<string, string> }
		const keys = Object.keys(manifest.rules)

		for (const key of keys) {
			expect(key).not.toMatch(/^@/)
			expect(key).toMatch(/^a1-[a-z0-9]{8}$/)
		}

		const rule = Object.values(manifest.rules)[0]
		expect(rule).toContain("@supports")
		expect(rule).toContain("display")
	})
})
