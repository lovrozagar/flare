/** @vitest-environment node */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { importFileFresh } from "../../../src/plugins/native-import.ts";

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true });
});

function bundleDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "flare-import-fresh-"));
	dirs.push(dir);
	writeFileSync(join(dir, "chunk.js"), 'export const chunk = "chunk";\n');
	return dir;
}

/*
 * Bug 77: a module runtime caches `import(serverPath)`, so a rebuilt bundle was served stale. Each
 * import of the bundle must load the file as it is now, in every runtime: Bun and vitest key their
 * caches by path and ignore a `?query`, so a cache-busting query alone is not enough.
 */
describe("built server bundle import", () => {
	it("loads the current file in-process, resolving the bundle's relative imports", async () => {
		const dir = bundleDir();
		const file = join(dir, "server.js");
		writeFileSync(file, 'export { chunk } from "./chunk.js";\nexport const version = 1;\n');
		const first = await importFileFresh<{ chunk: string; version: number }>(file);
		writeFileSync(file, 'export { chunk } from "./chunk.js";\nexport const version = 2;\n');
		const second = await importFileFresh<{ version: number }>(file);
		expect([first.version, second.version, first.chunk]).toEqual([1, 2, "chunk"]);
		expect(readdirSync(dir).sort()).toEqual(["chunk.js", "server.js"]);
	});

	it("loads the current file under Bun, within one millisecond", () => {
		const dir = bundleDir();
		const file = join(dir, "server.js");
		const helper = join(__dirname, "../../../src/plugins/native-import.ts");
		const script = `
			import { writeFileSync } from "node:fs";
			Date.now = () => 1;
			const { importFileFresh } = await import(${JSON.stringify(helper)});
			const file = ${JSON.stringify(file)};
			writeFileSync(file, "export const version = 1;");
			const first = (await importFileFresh(file)).version;
			writeFileSync(file, "export const version = 2;");
			const second = (await importFileFresh(file)).version;
			console.log(JSON.stringify([first, second]));
		`;
		const scriptFile = join(dir, "probe.mjs");
		writeFileSync(scriptFile, script);
		const out = execFileSync(process.env.FLARE_TEST_BUN ?? "bun", [scriptFile], { encoding: "utf8" });
		expect(JSON.parse(out.trim())).toEqual([1, 2]);
	});

	it.each(["dev-server.ts", "prerender-plugin.ts"])("%s loads the bundle through importFileFresh", (file) => {
		const source = readFileSync(join(__dirname, "../../../src/plugins", file), "utf-8");
		expect(source).toContain("importFileFresh");
		expect(source).not.toMatch(/import\(`\$\{serverPath\}/);
	});
});
