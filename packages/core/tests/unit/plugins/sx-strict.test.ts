/** @vitest-environment node */
/* sx.strict: a class literal that compiles to no CSS, or matches a deny pattern, fails the module. */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSxAstPlugin } from "../../../src/plugins/sx-ast/index.ts";
import type { SxAstOptions } from "../../../src/plugins/sx-ast/index.ts";

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true });
});

/* Palette reset: `bg-blue-500` compiles to nothing, `bg-surface` exists. */
function theme(): string {
	const dir = mkdtempSync(join(tmpdir(), "flare-sx-strict-"));
	dirs.push(dir);
	const path = join(dir, "theme.css");
	writeFileSync(
		path,
		'@import "tailwindcss";\n@theme {\n\t--color-*: initial;\n\t--background-color-surface: #fff;\n}\n',
	);
	return path;
}

async function plugin(strict: SxAstOptions["strict"]) {
	const p = createSxAstPlugin({ strict, tw: true, twCssPath: theme() });
	await (p.buildStart as (this: object) => Promise<void>).call({});
	return (code: string, id = "/src/view.tsx") =>
		(p.transform as (this: object, code: string, id: string) => unknown).call({}, code, id);
}

const STRICT = { allow: ["prose"], deny: [/^-?(m|p)[lr]-/] };

describe("sx.strict", () => {
	it("fails on a token that compiles to no CSS, naming file, line and token", async () => {
		const transform = await plugin(STRICT);
		const src =
			'export function A() {\n\treturn <div class="bg-surface" />;\n}\nexport function B() {\n\treturn <p class="bg-blue-500" />;\n}\n';
		expect(() => transform(src)).toThrow(/\/src\/view\.tsx:5.*"bg-blue-500"/);
	});

	it("fails on a deny pattern even though the utility compiles", async () => {
		const transform = await plugin(STRICT);
		expect(() => transform('export const A = () => <div class="ml-2" />;\n')).toThrow(/"ml-2"/);
	});

	it("checks literals inside cn() arms too", async () => {
		const transform = await plugin(STRICT);
		const src =
			'import { cn } from "@lovrozagar/flare/styles";\nexport const A = (p: { on: boolean }) => <div class={cn("bg-surface", p.on && "pl-4")} />;\n';
		expect(() => transform(src)).toThrow(/"pl-4"/);
	});

	it("passes markers, allowed names and known utilities", async () => {
		const transform = await plugin(STRICT);
		expect(() => transform('export const A = () => <div class="group prose bg-surface" />;\n')).not.toThrow();
	});

	it("ignores tokens that are not literals", async () => {
		const transform = await plugin(STRICT);
		expect(() => transform("export const A = (p: { c: string }) => <div class={p.c} />;\n")).not.toThrow();
	});

	it("is off by default", async () => {
		const transform = await plugin(undefined);
		expect(() => transform('export const A = () => <div class="bg-blue-500 ml-2" />;\n')).not.toThrow();
	});

	it("strict: true checks unknown tokens without deny patterns", async () => {
		const transform = await plugin(true);
		expect(() => transform('export const A = () => <div class="ml-2" />;\n')).not.toThrow();
		expect(() => transform('export const A = () => <div class="bg-blue-500" />;\n')).toThrow(/"bg-blue-500"/);
	});
});
