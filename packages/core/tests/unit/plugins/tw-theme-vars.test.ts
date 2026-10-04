/** @vitest-environment node */
/* sx.themeVars: "reference" keeps theme var() references and ships exactly the vars they need. */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	extractDeclarations,
	extractPrefaceCss,
	initTailwindCompiler,
	themeVarsBlock,
} from "../../../src/plugins/tw-compile.ts";

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true });
});

async function compiler() {
	const dir = mkdtempSync(join(tmpdir(), "flare-theme-vars-"));
	dirs.push(dir);
	const path = join(dir, "theme.css");
	writeFileSync(
		path,
		[
			'@import "tailwindcss";',
			"@theme {",
			"\t--color-*: initial;",
			"\t--background-color-canvas: var(--background-color-surface);",
			"\t--background-color-surface: var(--gray-1);",
			"\t--text-color-fg: var(--gray-12);",
			"}",
			":root {",
			"\t--gray-1: light-dark(#fff, #111);",
			"\t--gray-12: light-dark(#111, #eee);",
			"}",
		].join("\n"),
	);
	return initTailwindCompiler(path);
}

describe("themeVars reference mode", () => {
	it("keeps var() in the declaration when no theme map is passed", async () => {
		const tw = await compiler();
		expect(extractDeclarations(tw.build(["bg-canvas"]), ["bg-canvas"])).toBe(
			"background-color: var(--background-color-canvas);",
		);
	});

	it("emits the transitive closure of referenced theme vars, minus vars the preface already defines", async () => {
		const tw = await compiler();
		const preface = extractPrefaceCss(tw.build([]));
		tw.build(["bg-canvas"]);
		tw.build(["text-fg"]);
		expect(themeVarsBlock(new Set(["--background-color-canvas"]), tw.themeVars, preface)).toBe(
			"@layer theme { :root, :host { --background-color-canvas: var(--background-color-surface); --background-color-surface: var(--gray-1); } }",
		);
	});

	it("emits nothing when no theme var is referenced", async () => {
		const tw = await compiler();
		expect(themeVarsBlock(new Set(), tw.themeVars, "")).toBe("");
	});
});
