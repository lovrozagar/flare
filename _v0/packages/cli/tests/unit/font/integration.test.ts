import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fontAddNonInteractive, formatImportSnippets } from "../../../src/font/add";
import { listInstalledFonts } from "../../../src/font/list";
import { fontRemoveBySlug } from "../../../src/font/remove";
import type { FontEntry } from "../../../src/font/resolve";
import { readManifest } from "../../../src/font/tracking";

let tempDir: string;

const WOFF2_BYTES = new Uint8Array([0x77, 0x4f, 0x46, 0x32]);

const REGISTRY: FontEntry[] = [
	["Inter", "inter", "inter", "sans-serif"],
	["Lora", "lora", "lora", "serif"],
	["Fira Code", "fira-code", "firaCode", "monospace"],
	["Roboto", "roboto", "roboto", "sans-serif"],
];

const URL_MAP: Record<string, string> = {
	"/fonts/fira-code/latin.woff2": "https://cdn.example.com/fira-code/latin.woff2",
	"/fonts/inter/cyrillic.woff2": "https://cdn.example.com/inter/cyrillic.woff2",
	"/fonts/inter/latin-ext.woff2": "https://cdn.example.com/inter/latin-ext.woff2",
	"/fonts/inter/latin.woff2": "https://cdn.example.com/inter/latin.woff2",
	"/fonts/lora/latin-ext.woff2": "https://cdn.example.com/lora/latin-ext.woff2",
	"/fonts/lora/latin.woff2": "https://cdn.example.com/lora/latin.woff2",
	"/fonts/roboto/latin.woff2": "https://cdn.example.com/roboto/latin.woff2",
};

function createMockFetch() {
	return vi.fn().mockImplementation(() => Promise.resolve(new Response(WOFF2_BYTES, { status: 200 })));
}

beforeEach(() => {
	tempDir = join(tmpdir(), `flare-integ-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(join(tempDir, "public", "fonts"), { recursive: true });
});

afterEach(() => {
	rmSync(tempDir, { force: true, recursive: true });
	vi.restoreAllMocks();
});

describe("full add → list → remove flow", () => {
	it("adds fonts, lists them, then removes one", async () => {
		const mockFetch = createMockFetch();

		/* add two fonts */
		await fontAddNonInteractive({
			fetch: mockFetch,
			names: ["inter", "lora"],
			projectRoot: tempDir,
			registry: REGISTRY,
			urlMap: URL_MAP,
		});

		/* verify files on disk */
		expect(existsSync(join(tempDir, "public", "fonts", "inter", "latin.woff2"))).toBe(true);
		expect(existsSync(join(tempDir, "public", "fonts", "lora", "latin.woff2"))).toBe(true);

		/* verify manifest */
		const manifest = readManifest(tempDir);
		expect(Object.keys(manifest.fonts)).toEqual(["inter", "lora"]);

		/* verify list */
		const installed = listInstalledFonts(tempDir);
		expect(installed).toHaveLength(2);
		expect(installed.map((f) => f.slug)).toEqual(["inter", "lora"]);

		/* remove inter */
		fontRemoveBySlug(tempDir, "inter");

		/* verify inter gone from disk and manifest */
		expect(existsSync(join(tempDir, "public", "fonts", "inter"))).toBe(false);
		const afterRemove = readManifest(tempDir);
		expect(afterRemove.fonts.inter).toBeUndefined();
		expect(afterRemove.fonts.lora).toBeDefined();

		/* verify list updated */
		const afterList = listInstalledFonts(tempDir);
		expect(afterList).toHaveLength(1);
		expect(afterList[0]?.slug).toBe("lora");
	});
});

describe("idempotent add", () => {
	it("re-adding same font skips existing files", async () => {
		const mockFetch = createMockFetch();

		await fontAddNonInteractive({
			fetch: mockFetch,
			names: ["inter"],
			projectRoot: tempDir,
			registry: REGISTRY,
			subsets: ["latin"],
			urlMap: URL_MAP,
		});

		const secondFetch = createMockFetch();
		const result = await fontAddNonInteractive({
			fetch: secondFetch,
			names: ["inter"],
			projectRoot: tempDir,
			registry: REGISTRY,
			subsets: ["latin"],
			urlMap: URL_MAP,
		});

		expect(result.downloadResult.skipped).toBe(1);
		expect(result.downloadResult.downloaded).toBe(0);
	});

	it("re-adding with force re-downloads", async () => {
		const mockFetch = createMockFetch();

		await fontAddNonInteractive({
			fetch: mockFetch,
			names: ["inter"],
			projectRoot: tempDir,
			registry: REGISTRY,
			subsets: ["latin"],
			urlMap: URL_MAP,
		});

		const secondFetch = createMockFetch();
		const result = await fontAddNonInteractive({
			fetch: secondFetch,
			force: true,
			names: ["inter"],
			projectRoot: tempDir,
			registry: REGISTRY,
			subsets: ["latin"],
			urlMap: URL_MAP,
		});

		expect(result.downloadResult.downloaded).toBe(1);
		expect(result.downloadResult.skipped).toBe(0);
	});
});

describe("import snippets", () => {
	it("generates correct snippets after multi-font add", async () => {
		const mockFetch = createMockFetch();

		const result = await fontAddNonInteractive({
			fetch: mockFetch,
			names: ["inter", "fira-code"],
			projectRoot: tempDir,
			registry: REGISTRY,
			urlMap: URL_MAP,
		});

		const snippets = formatImportSnippets(result.added);
		expect(snippets).toHaveLength(2);
		expect(snippets[0]).toBe(`import { inter } from "@lovrozagar/flare/fonts/inter"`);
		expect(snippets[1]).toBe(`import { firaCode } from "@lovrozagar/flare/fonts/fira-code"`);
	});
});

describe("subset filtering across flows", () => {
	it("manifest tracks only downloaded subsets", async () => {
		const mockFetch = createMockFetch();

		await fontAddNonInteractive({
			fetch: mockFetch,
			names: ["inter"],
			projectRoot: tempDir,
			registry: REGISTRY,
			subsets: ["latin"],
			urlMap: URL_MAP,
		});

		const manifest = readManifest(tempDir);
		expect(manifest.fonts.inter?.subsets).toEqual(["latin"]);

		/* only latin downloaded, not cyrillic */
		expect(existsSync(join(tempDir, "public", "fonts", "inter", "latin.woff2"))).toBe(true);
		expect(existsSync(join(tempDir, "public", "fonts", "inter", "cyrillic.woff2"))).toBe(false);
	});

	it("changing subsets on re-add updates manifest", async () => {
		const mockFetch = createMockFetch();

		await fontAddNonInteractive({
			fetch: mockFetch,
			names: ["inter"],
			projectRoot: tempDir,
			registry: REGISTRY,
			subsets: ["latin"],
			urlMap: URL_MAP,
		});

		const secondFetch = createMockFetch();
		await fontAddNonInteractive({
			fetch: secondFetch,
			force: true,
			names: ["inter"],
			projectRoot: tempDir,
			registry: REGISTRY,
			subsets: ["latin", "cyrillic"],
			urlMap: URL_MAP,
		});

		const manifest = readManifest(tempDir);
		expect(manifest.fonts.inter?.subsets).toEqual(["cyrillic", "latin"]);
	});
});

describe("error handling", () => {
	it("partial failure: some fonts added, some unresolved", async () => {
		const mockFetch = createMockFetch();

		const result = await fontAddNonInteractive({
			fetch: mockFetch,
			names: ["inter", "comic-sans", "lora", "papyrus"],
			projectRoot: tempDir,
			registry: REGISTRY,
			urlMap: URL_MAP,
		});

		expect(result.added).toHaveLength(2);
		expect(result.unresolved).toEqual(["comic-sans", "papyrus"]);
		expect(result.added.map((f) => f.slug)).toEqual(["inter", "lora"]);

		const manifest = readManifest(tempDir);
		expect(Object.keys(manifest.fonts)).toEqual(["inter", "lora"]);
	});

	it("download failures tracked in result", async () => {
		let callCount = 0;
		const mockFetch = vi.fn().mockImplementation(() => {
			callCount++;
			if (callCount <= 2) {
				return Promise.resolve(new Response(WOFF2_BYTES, { status: 200 }));
			}
			return Promise.resolve(new Response(null, { status: 500 }));
		});

		const result = await fontAddNonInteractive({
			fetch: mockFetch,
			names: ["inter"],
			projectRoot: tempDir,
			registry: REGISTRY,
			urlMap: URL_MAP,
		});

		expect(result.downloadResult.downloaded).toBe(2);
		expect(result.downloadResult.failed).toBe(1);
		expect(result.downloadResult.failedPaths).toHaveLength(1);
	});
});
