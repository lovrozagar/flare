import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSxAstPlugin } from "../../../src/plugins/sx-ast/index.ts";
import { initTailwindCompiler } from "../../../src/plugins/tw-compile.ts";

const dirs: string[] = [];

/* A CSS tree outside the process cwd, so cwd-relative resolution cannot pass by accident. */
function cssTree(files: Record<string, string>): string {
	const dir = mkdtempSync(join(tmpdir(), "flare-tw-"));
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

describe("initTailwindCompiler — @import resolution", () => {
	it("resolves relative imports from the importing file's directory, nested too", async () => {
		const dir = cssTree({
			"styles/app.css": '@import "tailwindcss";\n@import "./tokens/brand.css";\n',
			"styles/tokens/brand.css": '@import "./palette.css";\n',
			"styles/tokens/palette.css": "@theme { --color-brand: #123456; }\n",
		});

		const compiler = await initTailwindCompiler(join(dir, "styles/app.css"));

		expect(compiler.build(["bg-brand"])).toContain("#123456");
	});

	it("keeps bare package specifiers working (tailwindcss and its CSS subpaths)", async () => {
		const dir = cssTree({
			"app.css": '@import "tailwindcss/theme.css";\n@import "tailwindcss/utilities.css";\n',
		});

		const compiler = await initTailwindCompiler(join(dir, "app.css"));

		expect(compiler.build(["p-4"])).toContain("padding");
	});

	it("names the missing file when an import cannot be resolved", async () => {
		const dir = cssTree({ "styles/app.css": '@import "tailwindcss";\n@import "./missing.css";\n' });

		await expect(initTailwindCompiler(join(dir, "styles/app.css"))).rejects.toThrow(/missing\.css/);
	});
});

describe("sx-ast plugin — Tailwind init failure fails the build", () => {
	it("buildStart rejects instead of logging and continuing", async () => {
		const dir = cssTree({ "styles/app.css": '@import "tailwindcss";\n@import "./missing.css";\n' });
		const plugin = createSxAstPlugin({ twCssPath: join(dir, "styles/app.css") });
		const buildStart = plugin.buildStart as (this: object) => Promise<void>;

		await expect(buildStart.call({ environment: { config: { root: dir } } })).rejects.toThrow(
			/Tailwind.*styles\/app\.css/s,
		);
	});
});
