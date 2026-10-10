/** @vitest-environment node */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createThemeCn } from "../../../src/plugins/cn-theme.ts";

const dirs: string[] = [];

/* A theme tree outside the process cwd, including an installed package, so resolution is real. */
function themeTree(files: Record<string, string>): string {
	const dir = mkdtempSync(join(tmpdir(), "flare-cn-theme-"));
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

function appTheme() {
	const dir = themeTree({
		"node_modules/@fixture/ui/package.json": JSON.stringify({
			name: "@fixture/ui",
			exports: { "./theme.css": "./theme.css" },
		}),
		"node_modules/@fixture/ui/theme.css":
			"@theme {\n\t--radius-control: 6px;\n\t--shadow-raised: 0 1px 2px #0002;\n}\n",
		"src/app.css": [
			'@import "tailwindcss";',
			'@import "@fixture/ui/theme.css";',
			'@import "./tokens.css";',
			"@theme {",
			"\t--background-color-surface: #fff;",
			"\t--background-color-raised: #fafafa;",
			"\t--text-color-muted: #555;",
			"}",
		].join("\n"),
		"src/tokens.css": "@theme {\n\t--text-body: 14px;\n\t--spacing-control: 2rem;\n}\n",
	});
	return createThemeCn(join(dir, "src/app.css"));
}

describe("createThemeCn — merge tables compiled from the app theme", () => {
	it("knows custom font sizes, so a color after a size keeps both", () => {
		const { cn } = appTheme();
		expect(cn("text-body", "text-muted")).toBe("text-body text-muted");
		expect(cn("text-muted", "text-body")).toBe("text-muted text-body");
	});

	it("merges custom radius, spacing and shadow names with built-in ones (from a package @import)", () => {
		const { cn } = appTheme();
		expect(cn("rounded-control", "rounded-lg")).toBe("rounded-lg");
		expect(cn("rounded-lg", "rounded-control")).toBe("rounded-control");
		expect(cn("h-control", "h-10")).toBe("h-10");
		expect(cn("shadow-raised", "shadow-sm")).toBe("shadow-sm");
	});

	it("keeps per-utility color names and default behavior", () => {
		const { cn } = appTheme();
		expect(cn("bg-surface", "bg-raised")).toBe("bg-raised");
		expect(cn("text-muted", "text-fg")).toBe("text-fg");
		expect(cn("px-2", "px-4")).toBe("px-4");
	});

	it("follows a `--<ns>-*: initial` reset like Tailwind does", () => {
		const dir = themeTree({
			"app.css": '@import "tailwindcss";\n@theme {\n\t--radius-*: initial;\n\t--radius-island: 12px;\n}\n',
		});
		const { cn } = createThemeCn(join(dir, "app.css"));
		expect(cn("rounded-island", "rounded-lg")).toBe("rounded-island rounded-lg");
		expect(cn("rounded-lg", "rounded-island")).toBe("rounded-lg rounded-island");
		expect(cn("rounded-island", "rounded-full")).toBe("rounded-full");
	});

	it("reports every file it read, for dev rebuilds", () => {
		const { files } = appTheme();
		expect(files.some((f) => f.endsWith("src/app.css"))).toBe(true);
		expect(files.some((f) => f.endsWith("src/tokens.css"))).toBe(true);
		expect(files.some((f) => f.endsWith("@fixture/ui/theme.css"))).toBe(true);
	});

	it("emits an importable tables module equivalent to the in-memory engine", async () => {
		const { source } = appTheme();
		const dir = themeTree({ "tables.mjs": source });
		const mod = (await import(join(dir, "tables.mjs"))) as { default: unknown };
		const { createEngine } = await import("../../../src/styles/cn-vendor/engine.ts");
		const engine = createEngine(mod.default as never);
		expect(engine.mergeString("rounded-control rounded-lg")).toBe("rounded-lg");
		expect(engine.mergeString("text-body text-muted")).toBe("text-body text-muted");
	});
});
