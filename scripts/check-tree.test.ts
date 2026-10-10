import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { checkTree } from "./check-tree.ts";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function makeRoot(): string {
	const root = join(tmpdir(), `flare-tree-${Date.now()}-${Math.random().toString(16).slice(2)}`);
	mkdirSync(root, { recursive: true });
	roots.push(root);
	return root;
}

function write(root: string, path: string, body: string): void {
	const full = join(root, path);
	mkdirSync(join(full, ".."), { recursive: true });
	writeFileSync(full, body);
}

function tsv(rows: string[]): string {
	return ["path\tphase\tkind\tenv\tresponsibility", ...rows].join("\n");
}

function row(path: string, phase: string, kind: string): string {
	return `${path}\t${phase}\t${kind}\tnode\tfixture`;
}

it("missing row fails", () => {
	const root = makeRoot();
	const kept = "packages/core/src/shared/kept.ts";
	const extra = "packages/core/src/shared/extra.ts";
	write(root, kept, "export const kept = 1;\n");
	write(root, extra, "export const extra = 1;\n");
	const tsvPath = join(root, "files.tsv");
	writeFileSync(tsvPath, tsv([row(kept, "P0", "src"), row(`${kept.replace(/\.ts$/, ".test.ts")}`, "P0", "test")]));
	const result = checkTree(root, tsvPath);
	expect(result.ok).toBe(false);
	expect(result.errors.some((error) => error.includes(extra))).toBe(true);
});

it("missing file fails", () => {
	const root = makeRoot();
	const kept = "packages/core/src/shared/kept.ts";
	const gone = "packages/core/src/shared/gone.ts";
	write(root, kept, "export const kept = 1;\n");
	const tsvPath = join(root, "files.tsv");
	writeFileSync(
		tsvPath,
		tsv([
			row(kept, "P0", "src"),
			row(kept.replace(/\.ts$/, ".test.ts"), "P0", "test"),
			row(gone, "P0", "src"),
			row(gone.replace(/\.ts$/, ".test.ts"), "P0", "test"),
		]),
	);
	const result = checkTree(root, tsvPath);
	expect(result.ok).toBe(false);
	expect(result.errors.some((error) => error.includes(gone))).toBe(true);
});

it("index with a statement fails", () => {
	const root = makeRoot();
	const index = "packages/core/src/shared/index.ts";
	write(root, index, "export const value = 1;\n");
	const tsvPath = join(root, "files.tsv");
	writeFileSync(tsvPath, tsv([row(index, "P0", "index")]));
	const result = checkTree(root, tsvPath);
	expect(result.ok).toBe(false);
});

it("src without a sibling test fails", () => {
	const root = makeRoot();
	const src = "packages/core/src/shared/alone.ts";
	write(root, src, "export const alone = 1;\n");
	const tsvPath = join(root, "files.tsv");
	writeFileSync(tsvPath, tsv([row(src, "P0", "src")]));
	const result = checkTree(root, tsvPath);
	expect(result.ok).toBe(false);
});

it("generated pattern matches keys", () => {
	const root = makeRoot();
	const registry = "packages/core/src/features/fonts/registry.json";
	const abel = "packages/core/src/features/fonts/shared/generated/abel.ts";
	const inter = "packages/core/src/features/fonts/shared/generated/inter.ts";
	const glob = "packages/core/src/features/fonts/shared/generated/*.ts";
	write(root, registry, JSON.stringify({ abel: { family: "Abel" }, inter: { family: "Inter" } }));
	write(root, abel, 'export default { family: "Abel" };\n');
	write(root, inter, 'export default { family: "Inter" };\n');
	const tsvPath = join(root, "files.tsv");
	writeFileSync(tsvPath, tsv([row(registry, "P14", "config"), row(glob, "P14", "generated")]));
	const result = checkTree(root, tsvPath);
	expect(result.ok).toBe(true);
	expect(result.generated).toEqual(["abel.ts", "inter.ts"]);
});
