/** @vitest-environment node */
/* Theme packages and Tailwind plugins load from the entry stylesheet's directory, like Node would. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initTailwindCompiler } from "../../../src/plugins/tw-compile.ts";

const dirs: string[] = [];

function cssTree(files: Record<string, string>): string {
	const dir = mkdtempSync(join(tmpdir(), "flare-tw-plugin-"));
	dirs.push(dir);
	for (const [rel, content] of Object.entries(files)) {
		const path = join(dir, rel);
		mkdirSync(join(path, ".."), { recursive: true });
		writeFileSync(path, content);
	}
	return dir;
}

afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true });
});

const PLUGIN_SOURCE = (cls: string, color: string) =>
	`export default function plugin({ addUtilities }) {\n\taddUtilities({ ".${cls}": { color: "${color}" } });\n}\n`;

describe("initTailwindCompiler — theme packages", () => {
	it("an installed package's stylesheet contributes its @theme (subpath export)", async () => {
		const dir = cssTree({
			"node_modules/@fixture/ui/package.json": JSON.stringify({
				name: "@fixture/ui",
				exports: { "./theme.css": "./theme.css" },
			}),
			"node_modules/@fixture/ui/theme.css": "@theme { --color-brand: #123456; }\n",
			"app/app.css": '@import "tailwindcss";\n@import "@fixture/ui/theme.css";\n',
		});
		const compiler = await initTailwindCompiler(join(dir, "app/app.css"));
		expect(compiler.build(["bg-brand"])).toContain("#123456");
	});
});

describe("initTailwindCompiler — @plugin", () => {
	it("loads a relative plugin module from the entry's directory", async () => {
		const dir = cssTree({
			"styles/app.css": '@import "tailwindcss";\n@plugin "./fixture-plugin.mjs";\n',
			"styles/fixture-plugin.mjs": PLUGIN_SOURCE("fixture-local", "#abcdef"),
		});
		const compiler = await initTailwindCompiler(join(dir, "styles/app.css"));
		expect(compiler.build(["fixture-local"])).toContain("#abcdef");
	});

	it("loads an installed plugin package", async () => {
		const dir = cssTree({
			"node_modules/@fixture/tw-plugin/package.json": JSON.stringify({
				name: "@fixture/tw-plugin",
				type: "module",
				exports: { ".": "./index.js" },
			}),
			"node_modules/@fixture/tw-plugin/index.js": PLUGIN_SOURCE("fixture-pkg", "#fedcba"),
			"app.css": '@import "tailwindcss";\n@plugin "@fixture/tw-plugin";\n',
		});
		const compiler = await initTailwindCompiler(join(dir, "app.css"));
		expect(compiler.build(["fixture-pkg"])).toContain("#fedcba");
	});

	it("names the plugin when it cannot be resolved", async () => {
		const dir = cssTree({ "app.css": '@import "tailwindcss";\n@plugin "@fixture/missing";\n' });
		await expect(initTailwindCompiler(join(dir, "app.css"))).rejects.toThrow("@fixture/missing");
	});
});
