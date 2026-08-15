import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fontAddNonInteractive, formatImportSnippets } from "../../../src/font/add";
import type { FontEntry } from "../../../src/font/resolve";
import { readManifest } from "../../../src/font/tracking";

let tempDir: string;

const WOFF2_BYTES = new Uint8Array([0x77, 0x4f, 0x46, 0x32]);

const REGISTRY: FontEntry[] = [
	["Inter", "inter", "inter", "sans-serif"],
	["Inter Tight", "inter-tight", "interTight", "sans-serif"],
	["Lora", "lora", "lora", "serif"],
	["Fira Code", "fira-code", "firaCode", "monospace"],
];

const URL_MAP: Record<string, string> = {
	"/fonts/fira-code/latin.woff2": "https://cdn.example.com/fira-code/latin.woff2",
	"/fonts/inter/cyrillic.woff2": "https://cdn.example.com/inter/cyrillic.woff2",
	"/fonts/inter/latin-ext.woff2": "https://cdn.example.com/inter/latin-ext.woff2",
	"/fonts/inter/latin.woff2": "https://cdn.example.com/inter/latin.woff2",
	"/fonts/lora/latin.woff2": "https://cdn.example.com/lora/latin.woff2",
};

beforeEach(() => {
	tempDir = join(tmpdir(), `flare-add-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(join(tempDir, "public", "fonts"), { recursive: true });
});

afterEach(() => {
	rmSync(tempDir, { force: true, recursive: true });
	vi.restoreAllMocks();
});

function createMockFetch() {
	return vi.fn().mockImplementation(() => Promise.resolve(new Response(WOFF2_BYTES, { status: 200 })));
}

describe("fontAddNonInteractive", () => {
	it("resolves and downloads a single font", async () => {
		const mockFetch = createMockFetch();

		const result = await fontAddNonInteractive({
			fetch: mockFetch,
			names: ["inter"],
			projectRoot: tempDir,
			registry: REGISTRY,
			urlMap: URL_MAP,
		});

		expect(result.added).toHaveLength(1);
		expect(result.added[0]?.slug).toBe("inter");
		expect(result.unresolved).toHaveLength(0);
		expect(result.downloadResult.downloaded).toBe(3);
	});

	it("updates manifest after download", async () => {
		const mockFetch = createMockFetch();

		await fontAddNonInteractive({
			fetch: mockFetch,
			names: ["inter"],
			projectRoot: tempDir,
			registry: REGISTRY,
			urlMap: URL_MAP,
		});

		const manifest = readManifest(tempDir);
		expect(manifest.fonts.inter).toBeDefined();
		expect(manifest.fonts.inter?.family).toBe("Inter");
		expect(manifest.fonts.inter?.subsets).toEqual(["cyrillic", "latin", "latin-ext"]);
	});

	it("resolves multiple fonts at once", async () => {
		const mockFetch = createMockFetch();

		const result = await fontAddNonInteractive({
			fetch: mockFetch,
			names: ["inter", "lora"],
			projectRoot: tempDir,
			registry: REGISTRY,
			urlMap: URL_MAP,
		});

		expect(result.added).toHaveLength(2);
		const manifest = readManifest(tempDir);
		expect(manifest.fonts.inter).toBeDefined();
		expect(manifest.fonts.lora).toBeDefined();
	});

	it("reports unresolved fonts", async () => {
		const mockFetch = createMockFetch();

		const result = await fontAddNonInteractive({
			fetch: mockFetch,
			names: ["inter", "comic-sans"],
			projectRoot: tempDir,
			registry: REGISTRY,
			urlMap: URL_MAP,
		});

		expect(result.added).toHaveLength(1);
		expect(result.unresolved).toEqual(["comic-sans"]);
	});

	it("filters by subsets when provided", async () => {
		const mockFetch = createMockFetch();

		const result = await fontAddNonInteractive({
			fetch: mockFetch,
			names: ["inter"],
			projectRoot: tempDir,
			registry: REGISTRY,
			subsets: ["latin"],
			urlMap: URL_MAP,
		});

		expect(result.downloadResult.downloaded).toBe(1);
		const manifest = readManifest(tempDir);
		expect(manifest.fonts.inter?.subsets).toEqual(["latin"]);
	});

	it("passes force flag through to download", async () => {
		/* pre-create an existing file */
		mkdirSync(join(tempDir, "public", "fonts", "inter"), { recursive: true });
		writeFileSync(join(tempDir, "public", "fonts", "inter", "latin.woff2"), "old");

		const mockFetch = createMockFetch();

		const result = await fontAddNonInteractive({
			fetch: mockFetch,
			force: true,
			names: ["inter"],
			projectRoot: tempDir,
			registry: REGISTRY,
			urlMap: URL_MAP,
		});

		expect(result.downloadResult.downloaded).toBe(3);
		expect(result.downloadResult.skipped).toBe(0);
	});

	it("skips existing files without force", async () => {
		mkdirSync(join(tempDir, "public", "fonts", "inter"), { recursive: true });
		writeFileSync(join(tempDir, "public", "fonts", "inter", "latin.woff2"), "old");

		const mockFetch = createMockFetch();

		const result = await fontAddNonInteractive({
			fetch: mockFetch,
			names: ["inter"],
			projectRoot: tempDir,
			registry: REGISTRY,
			urlMap: URL_MAP,
		});

		expect(result.downloadResult.skipped).toBe(1);
		expect(result.downloadResult.downloaded).toBe(2);
	});

	it("handles all names unresolved", async () => {
		const mockFetch = vi.fn();

		const result = await fontAddNonInteractive({
			fetch: mockFetch,
			names: ["comic-sans", "papyrus"],
			projectRoot: tempDir,
			registry: REGISTRY,
			urlMap: URL_MAP,
		});

		expect(result.added).toHaveLength(0);
		expect(result.unresolved).toEqual(["comic-sans", "papyrus"]);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it("resolves by family name (case-insensitive)", async () => {
		const mockFetch = createMockFetch();

		const result = await fontAddNonInteractive({
			fetch: mockFetch,
			names: ["Fira Code"],
			projectRoot: tempDir,
			registry: REGISTRY,
			urlMap: URL_MAP,
		});

		expect(result.added).toHaveLength(1);
		expect(result.added[0]?.slug).toBe("fira-code");
	});
});

describe("formatImportSnippets", () => {
	it("generates import for single font", () => {
		const snippets = formatImportSnippets([
			{ camelName: "inter", category: "sans-serif", family: "Inter", slug: "inter" },
		]);
		expect(snippets).toEqual([`import { inter } from "@lovrozagar/flare/fonts/inter"`]);
	});

	it("generates imports for multiple fonts", () => {
		const snippets = formatImportSnippets([
			{ camelName: "inter", category: "sans-serif", family: "Inter", slug: "inter" },
			{ camelName: "lora", category: "serif", family: "Lora", slug: "lora" },
		]);
		expect(snippets).toHaveLength(2);
		expect(snippets[0]).toContain("inter");
		expect(snippets[1]).toContain("lora");
	});

	it("uses camelName for import binding", () => {
		const snippets = formatImportSnippets([
			{ camelName: "firaCode", category: "monospace", family: "Fira Code", slug: "fira-code" },
		]);
		expect(snippets[0]).toBe(`import { firaCode } from "@lovrozagar/flare/fonts/fira-code"`);
	});

	it("returns empty for empty input", () => {
		const snippets = formatImportSnippets([]);
		expect(snippets).toEqual([]);
	});
});
