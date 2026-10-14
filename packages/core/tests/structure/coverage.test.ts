import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { checkCoverage, dxKeys, hasCase, parseCoverage, repoKeys } from "./coverage.ts";

// The coverage gate's reader on inline fixtures (B96, plan 14 9.2). The whole-repo case over blueprint/coverage.tsv
// lands at 9.7, when every key is mapped.
const repo = fileURLToPath(new URL("../../../../", import.meta.url));
const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

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
].join("\n");

// Each table row is a key under its nearest heading and its first header cell, and each `##` section's prose is one.
// A table or section under a Planned heading has none.
it("keys", () => {
	expect(dxKeys("router.md", DOC)).toEqual([
		"router.md#createRouter#prop:basePath",
		"router.md#createRouter#prop:rewrite",
		"router.md#rewrite#",
		"router.md#rewrite#failure:anything else",
	]);
});

// Three columns a line; several cases join with `;`; `n/a: <reason>` only in the e2e column.
it("parse", () => {
	const parsed = parseCoverage(
		"# comment\n\na#b#\tx.test.ts::one; y.test.ts::two\tn/a: no runtime surface\nc#d#\tx.test.ts::one\te.test.ts::three\nbad\nd#\tn/a: none\tn/a: none\n",
	);
	expect(parsed.rows).toEqual([
		{ key: "a#b#", integration: ["x.test.ts::one", "y.test.ts::two"], e2e: { none: "no runtime surface" } },
		{ key: "c#d#", integration: ["x.test.ts::one"], e2e: ["e.test.ts::three"] },
		{ key: "d#", integration: [], e2e: { none: "none" } },
	]);
	expect(parsed.errors).toEqual([
		"line 5: expected key, integration, and e2e",
		"line 6: the integration column takes no n/a",
	]);
});

// A case is a title passed to `it` or `test`, modifiers included; a title that only appears in text is not one.
it("case lookup", () => {
	const source =
		'it("one", () => {});\ntest.skip(`two`, () => {});\nit.runIf(x)(\'three\', () => {});\n// it("four")\nconst four = "four";';
	expect(["one", "two", "three", "four", "on"].map((title) => hasCase(source, title))).toEqual([
		true,
		true,
		true,
		true,
		false,
	]);
	expect(hasCase('const title = "five";', "five")).toBe(false);
});

// Every failure the gate reports: a duplicate dx key, a missing case or file, a key mapped twice, a stale key, a row
// with no integration case, an unmapped key. A complete map passes.
it("check", () => {
	const files: Record<string, string> = { "x.test.ts": 'it("one", () => {});', "e.test.ts": 'test("e", () => {});' };
	const read = (path: string): string | undefined => files[path];
	const ok = checkCoverage({
		keys: ["a#", "b#"],
		coverage: "a#\tx.test.ts::one\te.test.ts::e\nb#\tx.test.ts::one\tn/a: types only\n",
		read,
	});
	expect(ok).toEqual([]);
	const errors = checkCoverage({
		keys: ["a#", "b#", "c#", "c#"],
		coverage:
			"a#\tx.test.ts::nope\tgone.test.ts::e\na#\tx.test.ts::one\tn/a: r\nz#\tx.test.ts::one\tn/a: r\nb#\t\tn/a: r\n",
		read,
	});
	expect(errors).toEqual([
		"duplicate dx key c#",
		"missing case x.test.ts::nope: a#",
		"missing file gone.test.ts: a#",
		"mapped twice: a#",
		"stale: z#",
		"no integration case: b#",
		"unmapped: c#",
	]);
});

// A repo's keys come from every dx file but its index and the plan 15 file; the real dx files repeat no key.
it("repo keys", () => {
	const root = join(tmpdir(), `flare-coverage-${Date.now()}`);
	roots.push(root);
	mkdirSync(join(root, "blueprint/dx"), { recursive: true });
	writeFileSync(join(root, "blueprint/dx/README.md"), "| file | surface |\n| --- | --- |\n| `router.md` | x |\n");
	writeFileSync(
		join(root, "blueprint/dx/observability.md"),
		"## Logger\n\n| prop | x |\n| --- | --- |\n| `logger` | |\n",
	);
	writeFileSync(join(root, "blueprint/dx/router.md"), DOC);
	expect(repoKeys(root)).toEqual(dxKeys("router.md", DOC));
	const real = repoKeys(repo);
	expect(real.length).toBeGreaterThan(700);
	expect(real.filter((key, index) => real.indexOf(key) !== index)).toEqual([]);
});
