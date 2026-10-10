/** @vitest-environment node */
/* The cn an app ships merges with the app's theme: the sx plugin serves theme-compiled tables. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { build } from "vite";
import { createSxAstPlugin } from "../../../src/plugins/sx-ast/index.ts";

const STYLES_ENTRY = fileURLToPath(new URL("../../../src/styles/index.ts", import.meta.url));
const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true });
});

/* Silences Flare's logger in these bundles, as an app's `logLevel` would (Flare's plugin
   defines the level; the logger needs nothing else). */
const silentLogger = {
	config: () => ({ define: { __FLARE_LOG_LEVEL__: JSON.stringify("silent") } }),
	name: "silent-flare-logger",
};

async function buildAndImport(theme: string | undefined): Promise<{ merged: string; sized: string }> {
	const dir = mkdtempSync(join(tmpdir(), "flare-cn-theme-bundle-"));
	dirs.push(dir);
	const outDir = join(dir, "out");
	mkdirSync(outDir);
	const entry = join(dir, "entry.ts");
	writeFileSync(
		entry,
		`import { cn } from ${JSON.stringify(STYLES_ENTRY)};\n` +
			`export const merged = cn("h-control", "h-10");\n` +
			`export const sized = cn("text-body", "text-muted");\n`,
	);
	let twCssPath: string | undefined;
	if (theme) {
		twCssPath = join(dir, "theme.css");
		writeFileSync(twCssPath, theme);
	}
	await build({
		configFile: false,
		logLevel: "silent",
		plugins: [silentLogger, createSxAstPlugin(twCssPath ? { tw: true, twCssPath } : {})],
		root: dir,
		build: { lib: { entry, fileName: "out", formats: ["es"] }, minify: false, outDir, write: true },
	});
	const file = (await readdir(outDir)).find((name) => name.endsWith(".js") || name.endsWith(".mjs"));
	return (await import(pathToFileURL(join(outDir, file as string)).href)) as { merged: string; sized: string };
}

describe("cn bundle with an app theme", () => {
	it("merges theme tokens when the sx plugin has a twCssPath", async () => {
		const out = await buildAndImport(
			'@import "tailwindcss";\n@theme {\n\t--spacing-control: 2rem;\n\t--text-body: 14px;\n\t--text-color-muted: #555;\n}\n',
		);
		expect(out.merged).toBe("h-10");
		expect(out.sized).toBe("text-body text-muted");
	}, 180_000);

	it("keeps the default tables without a theme", async () => {
		const out = await buildAndImport(undefined);
		expect(out.merged).toBe("h-control h-10");
	}, 180_000);
});
