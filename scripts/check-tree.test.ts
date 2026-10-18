import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it } from "vitest"
import { checkTree } from "./check-tree.ts"

const roots: string[] = []

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function makeRoot(): string {
	const root = join(tmpdir(), `flare-tree-${Date.now()}-${Math.random().toString(16).slice(2)}`)
	mkdirSync(root, { recursive: true })
	roots.push(root)
	return root
}

function write(root: string, path: string, body: string): void {
	const full = join(root, path)
	mkdirSync(join(full, ".."), { recursive: true })
	writeFileSync(full, body)
}

function tsv(rows: string[]): string {
	return ["path\tphase\tkind\tenv\tresponsibility", ...rows].join("\n")
}

function row(path: string, phase: string, kind: string): string {
	return `${path}\t${phase}\t${kind}\tnode\tfixture`
}

it("missing row fails", () => {
	const root = makeRoot()
	const kept = "packages/core/src/shared/kept.ts"
	const extra = "packages/core/src/shared/extra.ts"
	write(root, kept, "export const kept = 1;\n")
	write(root, extra, "export const extra = 1;\n")
	const tsvPath = join(root, "files.tsv")
	writeFileSync(tsvPath, tsv([row(kept, "P0", "src"), row(`${kept.replace(/\.ts$/, ".test.ts")}`, "P0", "test")]))
	const result = checkTree(root, tsvPath)
	expect(result.ok).toBe(false)
	expect(result.errors.some((error) => error.includes(extra))).toBe(true)
})

it("missing file fails", () => {
	const root = makeRoot()
	const kept = "packages/core/src/shared/kept.ts"
	const gone = "packages/core/src/shared/gone.ts"
	write(root, kept, "export const kept = 1;\n")
	const tsvPath = join(root, "files.tsv")
	writeFileSync(
		tsvPath,
		tsv([
			row(kept, "P0", "src"),
			row(kept.replace(/\.ts$/, ".test.ts"), "P0", "test"),
			row(gone, "P0", "src"),
			row(gone.replace(/\.ts$/, ".test.ts"), "P0", "test"),
		]),
	)
	// P0 is the highest phase present, so the default check holds only the phases below it. `--complete` holds P0 too,
	// which is how a finished tree stays strict in CI.
	expect(checkTree(root, tsvPath).ok).toBe(true)
	const result = checkTree(root, tsvPath, { complete: "P0" })
	expect(result.ok).toBe(false)
	expect(result.errors.some((error) => error.includes(gone))).toBe(true)
})

it("index with a statement fails", () => {
	const root = makeRoot()
	const index = "packages/core/src/shared/index.ts"
	write(root, index, "export const value = 1;\n")
	const tsvPath = join(root, "files.tsv")
	writeFileSync(tsvPath, tsv([row(index, "P0", "index")]))
	const result = checkTree(root, tsvPath)
	expect(result.ok).toBe(false)
})

it("src without a sibling test fails", () => {
	const root = makeRoot()
	const src = "packages/core/src/shared/alone.ts"
	write(root, src, "export const alone = 1;\n")
	const tsvPath = join(root, "files.tsv")
	writeFileSync(tsvPath, tsv([row(src, "P0", "src")]))
	const result = checkTree(root, tsvPath)
	expect(result.ok).toBe(false)
})

it("generated pattern matches keys", () => {
	const root = makeRoot()
	const registry = "packages/core/src/features/fonts/registry.json"
	const abel = "packages/core/src/features/fonts/shared/generated/abel.ts"
	const inter = "packages/core/src/features/fonts/shared/generated/inter.ts"
	const glob = "packages/core/src/features/fonts/shared/generated/*.ts"
	write(root, registry, JSON.stringify({ abel: { family: "Abel" }, inter: { family: "Inter" } }))
	write(root, abel, 'export default { family: "Abel" };\n')
	write(root, inter, 'export default { family: "Inter" };\n')
	const tsvPath = join(root, "files.tsv")
	writeFileSync(tsvPath, tsv([row(registry, "P14", "config"), row(glob, "P14", "generated")]))
	const result = checkTree(root, tsvPath)
	expect(result.ok).toBe(true)
	expect(result.generated).toEqual(["abel.ts", "inter.ts"])
	// A key that prefixes another sorts as a filename does: `noto-sans-jp.ts` before `noto-sans.ts`.
	write(root, registry, JSON.stringify({ "noto-sans": {}, "noto-sans-jp": {} }))
	rmSync(join(root, abel))
	rmSync(join(root, inter))
	write(root, "packages/core/src/features/fonts/shared/generated/noto-sans.ts", "export default {};\n")
	write(root, "packages/core/src/features/fonts/shared/generated/noto-sans-jp.ts", "export default {};\n")
	expect(checkTree(root, tsvPath)).toMatchObject({ ok: true, generated: ["noto-sans-jp.ts", "noto-sans.ts"] })
})

it("tooling scripts skipped", () => {
	const root = makeRoot()
	const tracked = "scripts/tracked.ts"
	write(root, tracked, "export const tracked = 1;\n")
	write(root, "scripts/tool.mjs", "export const tool = 1;\n")
	write(root, "scripts/scrub-text", "#!/usr/bin/env node\n")
	const tsvPath = join(root, "files.tsv")
	writeFileSync(tsvPath, tsv([row(tracked, "P0", "script"), row("scripts/tracked.test.ts", "P0", "test")]))
	write(root, "scripts/tracked.test.ts", "export {};\n")
	expect(checkTree(root, tsvPath)).toEqual({ ok: true, errors: [], generated: [] })
	write(root, "scripts/untracked.ts", "export const untracked = 1;\n")
	expect(checkTree(root, tsvPath).errors).toEqual(["scripts/untracked.ts"])
})

// A bit's Done names its phase: every non-glob row of it must exist, even while it is the highest phase present.
it("complete phase", () => {
	const root = makeRoot()
	const kept = "packages/core/src/shared/kept.ts"
	const later = "packages/core/src/shared/later.ts"
	write(root, kept, "export const kept = 1;\n")
	write(root, kept.replace(/\.ts$/, ".test.ts"), "")
	const tsvPath = join(root, "files.tsv")
	writeFileSync(
		tsvPath,
		tsv([
			row(kept, "P1", "src"),
			row(kept.replace(/\.ts$/, ".test.ts"), "P1", "test"),
			row(later, "P1", "src"),
			row(later.replace(/\.ts$/, ".test.ts"), "P1", "test"),
			row("packages/core/src/shared/future.ts", "P2", "src"),
			row("packages/core/src/shared/future.test.ts", "P2", "test"),
		]),
	)
	// P1 is the highest phase present and P2 is listed, so the default check stops below P1.
	expect(checkTree(root, tsvPath).ok).toBe(true)
	const complete = checkTree(root, tsvPath, { complete: "P1" })
	expect(complete.ok).toBe(false)
	expect(complete.errors).toEqual([later, later.replace(/\.ts$/, ".test.ts")])
	expect(() => checkTree(root, tsvPath, { complete: "P99" })).toThrow("P99")
})

// An e2e app tree is one `**` row (B94): it matches files at any depth under its prefix and nothing outside it.
it("deep glob", () => {
	const root = makeRoot()
	const inside = "packages/core/tests/e2e/apps/docs/src/routes/a/b.page.tsx"
	const outside = "packages/core/tests/e2e/apps/other/src/c.ts"
	write(root, inside, "")
	write(root, outside, "")
	const tsvPath = join(root, "files.tsv")
	writeFileSync(tsvPath, tsv([row("packages/core/tests/e2e/apps/docs/**", "P15", "app")]))
	expect(checkTree(root, tsvPath).errors).toEqual([outside])
})

// A single `*` stays inside one directory.
it("single glob stays one segment", () => {
	const root = makeRoot()
	const flat = "packages/core/tests/structure/snapshots/a.txt"
	const nested = "packages/core/tests/structure/snapshots/deep/b.txt"
	write(root, flat, "")
	write(root, nested, "")
	const tsvPath = join(root, "files.tsv")
	writeFileSync(tsvPath, tsv([row("packages/core/tests/structure/snapshots/*.txt", "P14", "generated")]))
	expect(checkTree(root, tsvPath).errors).toEqual([nested])
})

it("p15", () => {
	const root = makeRoot()
	const tsvPath = join(root, "files.tsv")
	writeFileSync(tsvPath, tsv([]))
	expect(checkTree(root, tsvPath, { complete: "P15" }).ok).toBe(true)
})

// P16 is a phase (bits/16): once a P16 file exists, P15 is below the highest phase and must be complete.
it("p16", () => {
	const root = makeRoot()
	const tsvPath = join(root, "files.tsv")
	const rows = [row("docs/late.md", "P15", "doc"), row("docs/grid.md", "P16", "doc")]
	writeFileSync(tsvPath, tsv(rows))
	expect(checkTree(root, tsvPath, { complete: "P16" }).ok).toBe(false)
	write(root, "docs/grid.md", "")
	expect(checkTree(root, tsvPath).errors).toContain("docs/late.md")
	write(root, "docs/late.md", "")
	expect(checkTree(root, tsvPath, { complete: "P16" }).ok).toBe(true)
})

// P17 is a phase (bits/17, B146): once a P17 file exists, P16 is below the highest phase and must be complete.
it("p17", () => {
	const root = makeRoot()
	const tsvPath = join(root, "files.tsv")
	const rows = [row("docs/grid.md", "P16", "doc"), row("docs/dashboard.md", "P17", "doc")]
	writeFileSync(tsvPath, tsv(rows))
	expect(checkTree(root, tsvPath, { complete: "P17" }).ok).toBe(false)
	write(root, "docs/dashboard.md", "")
	expect(checkTree(root, tsvPath).errors).toContain("docs/grid.md")
	write(root, "docs/grid.md", "")
	expect(checkTree(root, tsvPath, { complete: "P17" }).ok).toBe(true)
})
