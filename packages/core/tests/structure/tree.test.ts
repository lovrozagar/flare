import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { checkTree } from "../../../../scripts/check-tree.ts";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function makeRoot(): string {
	const root = join(tmpdir(), `flare-structure-${Date.now()}-${Math.random().toString(16).slice(2)}`);
	mkdirSync(root, { recursive: true });
	roots.push(root);
	return root;
}

function write(root: string, path: string, body: string): void {
	const full = join(root, path);
	mkdirSync(join(full, ".."), { recursive: true });
	writeFileSync(full, body);
}

function manifest(rows: string[]): string {
	return ["path\tphase\tkind\tenv\tresponsibility", ...rows].join("\n");
}

it("extra file", () => {
	const root = makeRoot();
	const listed = "packages/core/src/shared/listed.ts";
	const extra = "packages/core/src/shared/extra.ts";
	write(root, listed, "export const listed = 1;\n");
	write(root, extra, "export const extra = 1;\n");
	const tsvPath = join(root, "files.tsv");
	writeFileSync(
		tsvPath,
		manifest([`${listed}\tP0\tsrc\tnode\tfixture`, `${listed.replace(/\.ts$/, ".test.ts")}\tP0\ttest\tnode\tfixture`]),
	);
	const result = checkTree(root, tsvPath);
	expect(result.ok).toBe(false);
	expect(result.errors.some((error) => error.includes(extra))).toBe(true);
});

it("missing file", () => {
	const root = makeRoot();
	const listed = "packages/core/src/shared/listed.ts";
	const missing = "packages/core/src/shared/missing.ts";
	write(root, listed, "export const listed = 1;\n");
	const tsvPath = join(root, "files.tsv");
	writeFileSync(
		tsvPath,
		manifest([
			`${listed}\tP0\tsrc\tnode\tfixture`,
			`${listed.replace(/\.ts$/, ".test.ts")}\tP0\ttest\tnode\tfixture`,
			`${missing}\tP0\tsrc\tnode\tfixture`,
			`${missing.replace(/\.ts$/, ".test.ts")}\tP0\ttest\tnode\tfixture`,
		]),
	);
	const result = checkTree(root, tsvPath);
	expect(result.ok).toBe(false);
	expect(result.errors.some((error) => error.includes(missing))).toBe(true);
});

it("index with a statement", () => {
	const root = makeRoot();
	const index = "packages/core/src/shared/index.ts";
	write(root, index, "export function open() {\n\treturn 1;\n}\n");
	const tsvPath = join(root, "files.tsv");
	writeFileSync(tsvPath, manifest([`${index}\tP0\tindex\tnode\tfixture`]));
	const result = checkTree(root, tsvPath);
	expect(result.ok).toBe(false);
});
