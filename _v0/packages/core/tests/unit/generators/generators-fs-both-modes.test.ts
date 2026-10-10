import { mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runGenerate } from "../../../src/generators/index.ts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");

function writeFile(root: string, relPath: string, content: string): void {
	const full = join(root, relPath);
	mkdirSync(join(full, ".."), { recursive: true });
	writeFileSync(full, content, "utf-8");
}

function vLines(gen: string): string[] {
	return [...gen.matchAll(/v: "([^"]+)"/g)].map((m) => m[1] ?? "").sort();
}

function xLines(gen: string): string[] {
	return [...gen.matchAll(/x: "([^"]+)"/g)].map((m) => m[1] ?? "").sort();
}

describe("fsVirtualPaths false — deep", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = join(tmpdir(), `flare-fs-false-${Date.now()}-${Math.random().toString(16).slice(2)}`);
		mkdirSync(tmpDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tmpDir, { force: true, recursive: true });
	});

	it("does not warn on string-style about.tsx / _root_.tsx / _layout_.tsx", () => {
		writeFile(tmpDir, "src/routes/_root_.tsx", `export const route = createRootLayout("_root_")\n`);
		writeFile(tmpDir, "src/routes/about.tsx", `export const route = createPage("_root_/about")\n`);
		writeFile(tmpDir, "src/routes/blog/_layout_.tsx", `export const route = createLayout("_root_/(blog)")\n`);
		const result = runGenerate({ fsCodegen: false, rootDir: tmpDir });
		expect(result.warnings).toEqual([]);
		expect(result.routes).toBe(1);
		expect(result.layouts).toBe(2);
	});

	it("emits both string-style and suffix files in a mixed tree", () => {
		writeFile(tmpDir, "src/routes/about.tsx", `export const route = createPage("_root_/about")\n`);
		writeFile(
			tmpDir,
			"src/routes/_root_/contact/contact.page.tsx",
			`export const route = createPage("_root_/contact")\n`,
		);
		const result = runGenerate({ fsCodegen: false, rootDir: tmpDir });
		expect(result.routes).toBe(2);
		expect(result.warnings).toEqual([]);
		const gen = readFileSync(join(tmpDir, "src/_gen/routes.gen.ts"), "utf-8");
		expect(gen).toContain('x: "_root_/about"');
		expect(gen).toContain('x: "_root_/contact"');
		expect(gen).toContain("../routes/about");
		expect(gen).toContain("../routes/_root_/contact/contact.page");
	});

	it("keeps a stale handwritten path (does not derive from folder)", () => {
		writeFile(tmpDir, "src/routes/users/[id].tsx", `export const route = createPage("_root_/old")\n`);
		runGenerate({ fsCodegen: false, rootDir: tmpDir });
		expect(readFileSync(join(tmpDir, "src/routes/users/[id].tsx"), "utf-8")).toContain(`createPage("_root_/old")`);
		expect(readFileSync(join(tmpDir, "src/_gen/routes.gen.ts"), "utf-8")).toContain('x: "_root_/old"');
	});

	it("picks up createPathSegment in string-style files", () => {
		writeFile(tmpDir, "src/routes/[locale].tsx", `export const locale = createPathSegment("_root_/[locale]")\n`);
		writeFile(tmpDir, "src/routes/about.tsx", `export const route = createPage("_root_/about")\n`);
		const result = runGenerate({ fsCodegen: false, rootDir: tmpDir });
		expect(result.layouts).toBe(1);
		expect(readFileSync(join(tmpDir, "src/_gen/routes.gen.ts"), "utf-8")).toContain('"_root_/[locale]"');
	});

	it("writes types.gen.d.ts", () => {
		writeFile(tmpDir, "src/routes/about.tsx", `export const route = createPage("_root_/about")\n`);
		runGenerate({ fsCodegen: false, rootDir: tmpDir });
		const types = readFileSync(join(tmpDir, "src/_gen/types.gen.d.ts"), "utf-8");
		expect(types).toContain("vite/client");
		expect(types).toContain("@lovrozagar/flare/virtual-types");
	});

	it("still validates duplicates", () => {
		writeFile(tmpDir, "src/routes/a.tsx", `export const A = createPage("_root_/dup")\n`);
		writeFile(tmpDir, "src/routes/b.tsx", `export const B = createPage("_root_/dup")\n`);
		expect(() => runGenerate({ fsCodegen: false, rootDir: tmpDir })).toThrow(/Duplicate page/);
	});

	it("empty project does not crash", () => {
		mkdirSync(join(tmpDir, "src", "routes"), { recursive: true });
		const result = runGenerate({ fsCodegen: false, rootDir: tmpDir });
		expect(result).toEqual({ layouts: 0, routes: 0, warnings: [] });
	});

	it("flare-fs-paths suffix files still generate when fs is off (strings already written)", () => {
		const result = runGenerate({
			fsCodegen: false,
			rootDir: join(REPO_ROOT, "e2e/apps/fs-routes"),
		});
		expect(result.routes).toBeGreaterThanOrEqual(10);
		expect(result.warnings).toEqual([]);
	});
});

describe("fsVirtualPaths true — remaining gaps", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = join(tmpdir(), `flare-fs-true-${Date.now()}-${Math.random().toString(16).slice(2)}`);
		mkdirSync(tmpDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tmpDir, { force: true, recursive: true });
	});

	it("warns about a missing root-layout when pages exist", () => {
		writeFile(tmpDir, "src/routes/_root_/home.page.tsx", "");
		const result = runGenerate({ fsCodegen: true, rootDir: tmpDir });
		expect(result.routes).toBe(1);
		expect(result.warnings.some((w) => w.includes("root-layout"))).toBe(true);
	});

	it("does not warn about missing root-layout when one exists", () => {
		writeFile(tmpDir, "src/routes/_root_/root.root-layout.tsx", "");
		writeFile(tmpDir, "src/routes/_root_/home.page.tsx", "");
		const result = runGenerate({ fsCodegen: true, rootDir: tmpDir });
		expect(result.warnings.filter((w) => w.includes("root-layout"))).toEqual([]);
	});

	it("emits several warnings at once and still generates valid routes", () => {
		writeFile(tmpDir, "src/routes/_root_/root.root-layout.tsx", "");
		writeFile(tmpDir, "src/routes/_root_/home.page.tsx", "");
		writeFile(tmpDir, "src/routes/orphan.tsx", `export const route = createPage("_root_/orphan")\n`);
		writeFile(tmpDir, "src/routes/loose/loose.page.tsx", "");
		writeFile(tmpDir, "src/pages/extra.page.tsx", `export const route = createPage("_root_/extra")\n`);

		const result = runGenerate({ fsCodegen: true, rootDir: tmpDir });
		expect(result.routes).toBe(1);
		expect(result.warnings.length).toBeGreaterThanOrEqual(3);
		expect(result.warnings.some((w) => w.includes("orphan.tsx"))).toBe(true);
		expect(result.warnings.some((w) => w.includes("loose/loose.page.tsx"))).toBe(true);
		expect(result.warnings.some((w) => w.includes("pages/extra.page.tsx"))).toBe(true);
		const gen = readFileSync(join(tmpDir, "src/_gen/routes.gen.ts"), "utf-8");
		expect(gen).toContain('x: "_root_/"');
		expect(gen).not.toContain("orphan");
		expect(gen).not.toContain("/extra");
	});

	it("writes types.gen.d.ts", () => {
		writeFile(tmpDir, "src/routes/_root_/home.page.tsx", "");
		runGenerate({ fsCodegen: true, rootDir: tmpDir });
		const types = readFileSync(join(tmpDir, "src/_gen/types.gen.d.ts"), "utf-8");
		expect(types).toContain("vite/client");
		expect(types).toContain("@lovrozagar/flare/virtual-types");
	});

	it("deleting a page removes it from the next generate", () => {
		writeFile(tmpDir, "src/routes/_root_/home.page.tsx", "");
		writeFile(tmpDir, "src/routes/_root_/about/about.page.tsx", "");
		runGenerate({ fsCodegen: true, rootDir: tmpDir });
		expect(vLines(readFileSync(join(tmpDir, "src/_gen/routes.gen.ts"), "utf-8"))).toEqual(["/", "/about"]);
		unlinkSync(join(tmpDir, "src/routes/_root_/about/about.page.tsx"));
		runGenerate({ fsCodegen: true, rootDir: tmpDir });
		expect(vLines(readFileSync(join(tmpDir, "src/_gen/routes.gen.ts"), "utf-8"))).toEqual(["/"]);
	});

	it("moving a page rewrites the virtual path", () => {
		writeFile(tmpDir, "src/routes/_root_/about/about.page.tsx", "");
		runGenerate({ fsCodegen: true, rootDir: tmpDir });
		const moved = join(tmpDir, "src/routes/_root_/contact/contact.page.tsx");
		mkdirSync(join(moved, ".."), { recursive: true });
		writeFileSync(moved, readFileSync(join(tmpDir, "src/routes/_root_/about/about.page.tsx"), "utf-8"));
		unlinkSync(join(tmpDir, "src/routes/_root_/about/about.page.tsx"));
		runGenerate({ fsCodegen: true, rootDir: tmpDir });
		expect(readFileSync(moved, "utf-8")).toContain(`createPage("_root_/contact")`);
		expect(readFileSync(join(tmpDir, "src/_gen/routes.gen.ts"), "utf-8")).toContain('x: "_root_/contact"');
	});

	it("includes a .path-segment.tsx in layouts", () => {
		writeFile(tmpDir, "src/routes/_root_/root.root-layout.tsx", "");
		writeFile(tmpDir, "src/routes/_root_/[locale]/locale.path-segment.tsx", "");
		writeFile(tmpDir, "src/routes/_root_/[locale]/about/about.page.tsx", "");
		const result = runGenerate({ fsCodegen: true, rootDir: tmpDir });
		expect(result.layouts).toBe(2);
		expect(result.routes).toBe(1);
		const gen = readFileSync(join(tmpDir, "src/_gen/routes.gen.ts"), "utf-8");
		expect(gen).toContain('"_root_/[locale]"');
		expect(gen).toContain('v: "/[locale]/about"');
	});

	it("leftover string-style plus duplicate suffix pages still throws validation", () => {
		writeFile(tmpDir, "src/routes/_root_/a.page.tsx", "");
		writeFile(tmpDir, "src/routes/_root_/b.page.tsx", "");
		writeFile(tmpDir, "src/routes/orphan.tsx", `export const route = createPage("_root_/x")\n`);
		expect(() => runGenerate({ fsCodegen: true, rootDir: tmpDir })).toThrow(/Duplicate page/);
	});
});

describe("same routes generated both ways", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = join(tmpdir(), `flare-fs-parity-${Date.now()}-${Math.random().toString(16).slice(2)}`);
		mkdirSync(tmpDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tmpDir, { force: true, recursive: true });
	});

	it("true suffix tree and false string tree emit the same v/x pairs", () => {
		const fsRoot = join(tmpDir, "fs");
		const strRoot = join(tmpDir, "str");
		writeFile(fsRoot, "src/routes/_root_/root.root-layout.tsx", "");
		writeFile(fsRoot, "src/routes/_root_/home.page.tsx", "");
		writeFile(fsRoot, "src/routes/_root_/about/about.page.tsx", "");
		writeFile(fsRoot, "src/routes/_root_/users/[id]/user.page.tsx", "");
		writeFile(fsRoot, "src/routes/_root_/(blog)/blog.layout.tsx", "");
		writeFile(fsRoot, "src/routes/_root_/(blog)/blog/list.page.tsx", "");

		writeFile(strRoot, "src/routes/_root_.tsx", `export const route = createRootLayout("_root_")\n`);
		writeFile(strRoot, "src/routes/index.tsx", `export const route = createPage("_root_/")\n`);
		writeFile(strRoot, "src/routes/about.tsx", `export const route = createPage("_root_/about")\n`);
		writeFile(strRoot, "src/routes/users/[id].tsx", `export const route = createPage("_root_/users/[id]")\n`);
		writeFile(strRoot, "src/routes/blog/_layout_.tsx", `export const route = createLayout("_root_/(blog)")\n`);
		writeFile(strRoot, "src/routes/blog/index.tsx", `export const route = createPage("_root_/(blog)/blog")\n`);

		runGenerate({ fsCodegen: true, rootDir: fsRoot });
		runGenerate({ fsCodegen: false, rootDir: strRoot });

		const fsGen = readFileSync(join(fsRoot, "src/_gen/routes.gen.ts"), "utf-8");
		const strGen = readFileSync(join(strRoot, "src/_gen/routes.gen.ts"), "utf-8");
		expect(vLines(fsGen)).toEqual(vLines(strGen));
		expect(xLines(fsGen)).toEqual(xLines(strGen));
	});
});
