import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, expect, it } from "vitest"
import { checkCoverage, dxKeys, hasCase, parseCoverage, repoKeys } from "./coverage.ts"

// The coverage gate's reader on inline fixtures (B96, plan 14 9.2), and the gate itself over the repo (plan 14 9.7).
const repo = fileURLToPath(new URL("../../../../", import.meta.url))
const roots: string[] = []

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const DOC = [
	"# createRouter",
	"",
	"| prop | required | default |",
	"| --- | --- | --- |",
	'| `basePath` | no | `"/"` |',
	"| `rewrite` | no | `(l) => l \\| undefined` |",
	"",
	"## rewrite",
	"",
	"Prose.",
	"",
	"| failure | function |",
	"| :-- | --- |",
	"| anything else | `errorRender` |",
	"",
	"### Planned (plan 15)",
	"",
	"| prop | required |",
	"| --- | --- |",
	"| `later` | no |",
	"",
	"## Planned (plan 15)",
	"",
	"Later prose.",
].join("\n")

// Each table row is a key under its nearest heading and its first header cell, and each `##` section's prose is one.
// A table or section under a Planned heading has none.
it("keys", () => {
	expect(dxKeys("router.md", DOC)).toEqual([
		"router.md#createRouter#prop:basePath",
		"router.md#createRouter#prop:rewrite",
		"router.md#rewrite#",
		"router.md#rewrite#failure:anything else",
	])
})

// Three columns a line; several cases join with `;`; `n/a: <reason>` only in the e2e column.
it("parse", () => {
	const parsed = parseCoverage(
		"# comment\n\na#b#\tx.test.ts::one; y.test.ts::two\tn/a: no runtime surface\nc#d#\tx.test.ts::one\te.test.ts::three\nbad\n",
	)
	expect(parsed.rows).toEqual([
		{ key: "a#b#", integration: ["x.test.ts::one", "y.test.ts::two"], e2e: { none: "no runtime surface" } },
		{ key: "c#d#", integration: ["x.test.ts::one"], e2e: ["e.test.ts::three"] },
	])
	expect(parsed.errors).toEqual(["line 5: expected key, integration, and e2e"])
})

// Strict cells (B96): the e2e column is cases or exactly one `n/a: <reason>` with a reason, and the integration column
// has no n/a anywhere. Every malformed cell is an error naming its line; none is dropped quietly (flare-77's probes).
it("strict cells", () => {
	const lines = [
		"a#\tint.test.ts::real\t",
		"b#\tint.test.ts::real\tn/a: ",
		"c#\tint.test.ts::real\tn/a:",
		"d#\tint.test.ts::real\tn/a",
		"e#\tint.test.ts::real\tspec.ts::real; n/a",
		"f#\tint.test.ts::real; n/a: x\tspec.ts::real",
		"g#\tn/a: x\tspec.ts::real",
		"h#\tint.test.ts\tspec.ts::real",
	]
	expect(parseCoverage(lines.join("\n")).errors).toEqual([
		"line 1: the e2e column is empty",
		"line 2: e2e part is not file::case: n/a:",
		"line 3: e2e part is not file::case: n/a:",
		"line 4: e2e part is not file::case: n/a",
		"line 5: e2e part is not file::case: n/a",
		"line 6: integration part is not file::case: n/a: x",
		"line 7: integration part is not file::case: n/a: x",
		"line 8: integration part is not file::case: int.test.ts",
	])
})

// A case is a title passed to `it` or `test`, modifiers included; a title that only appears in text is not one.
it("case lookup", () => {
	const source =
		'it("one", () => {});\ntest.skip(`two`, () => {});\nit.runIf(x)(\'three\', () => {});\n// it("four")\nconst four = "four";'
	expect(["one", "two", "three", "four", "on"].map((title) => hasCase(source, title))).toEqual([
		true,
		true,
		true,
		true,
		false,
	])
	expect(hasCase('const title = "five";', "five")).toBe(false)
})

// Every failure the gate reports: a duplicate dx key, a missing case or file, a key mapped twice, a stale key, a row
// with no integration case, an unmapped key. A complete map passes.
it("check", () => {
	const files: Record<string, string> = { "x.test.ts": 'it("one", () => {});', "e.test.ts": 'test("e", () => {});' }
	const read = (path: string): string | undefined => files[path]
	const ok = checkCoverage({
		keys: ["a#", "b#"],
		coverage: "a#\tx.test.ts::one\te.test.ts::e\nb#\tx.test.ts::one\tn/a: types only\n",
		read,
	})
	expect(ok).toEqual([])
	const errors = checkCoverage({
		keys: ["a#", "b#", "c#", "c#"],
		coverage:
			"a#\tx.test.ts::nope\tgone.test.ts::e\na#\tx.test.ts::one\tn/a: r\nz#\tx.test.ts::one\tn/a: r\nb#\t\tn/a: r\n",
		read,
	})
	expect(errors).toEqual([
		"duplicate dx key c#",
		"missing case x.test.ts::nope: a#",
		"missing file gone.test.ts: a#",
		"mapped twice: a#",
		"stale: z#",
		"no integration case: b#",
		"unmapped: c#",
	])
})

// A repo's keys come from every dx file but its index and the plan 15 file; the real dx files repeat no key.
it("repo keys", () => {
	const root = join(tmpdir(), `flare-coverage-${Date.now()}`)
	roots.push(root)
	mkdirSync(join(root, "blueprint/dx"), { recursive: true })
	writeFileSync(join(root, "blueprint/dx/README.md"), "| file | surface |\n| --- | --- |\n| `router.md` | x |\n")
	writeFileSync(
		join(root, "blueprint/dx/observability.md"),
		"## Logger\n\n| prop | x |\n| --- | --- |\n| `logger` | |\n",
	)
	writeFileSync(join(root, "blueprint/dx/router.md"), DOC)
	expect(repoKeys(root)).toEqual(dxKeys("router.md", DOC))
	const real = repoKeys(repo)
	expect(real.length).toBeGreaterThan(700)
	expect(real.filter((key, index) => real.indexOf(key) !== index)).toEqual([])
})

// The gate (plan 14 9.7, plan 25 7.1): every key of every dx file the reader reads is mapped once in
// blueprint/coverage.tsv, to integration cases that exist, with an e2e case or a reason, and no row is stale.
it("coverage", () => {
	const read = (path: string): string | undefined => {
		try {
			return readFileSync(join(repo, path), "utf8")
		} catch {
			return undefined
		}
	}
	const map = readFileSync(join(repo, "blueprint/coverage.tsv"), "utf8")
	expect(checkCoverage({ keys: repoKeys(repo), coverage: map, read })).toEqual([])
})
