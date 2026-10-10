import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadFonts, getSubsetsForFont, getUrlsForFont } from "../../../src/font/download";

let tempDir: string;

beforeEach(() => {
	tempDir = join(tmpdir(), `flare-dl-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(tempDir, { recursive: true });
});

afterEach(() => {
	rmSync(tempDir, { force: true, recursive: true });
	vi.restoreAllMocks();
});

const MOCK_URL_MAP: Record<string, string> = {
	"/fonts/inter/cyrillic.woff2": "https://cdn.example.com/inter/cyrillic.woff2",
	"/fonts/inter/latin-ext.woff2": "https://cdn.example.com/inter/latin-ext.woff2",
	"/fonts/inter/latin.woff2": "https://cdn.example.com/inter/latin.woff2",
	"/fonts/lora/latin-ext.woff2": "https://cdn.example.com/lora/latin-ext.woff2",
	"/fonts/lora/latin.woff2": "https://cdn.example.com/lora/latin.woff2",
};

const WOFF2_BYTES = new Uint8Array([0x77, 0x4f, 0x46, 0x32]);

describe("getUrlsForFont", () => {
	it("returns all entries for a font slug", () => {
		const urls = getUrlsForFont("inter", MOCK_URL_MAP);
		expect(urls).toHaveLength(3);
		expect(urls.map(([p]) => p)).toEqual([
			"/fonts/inter/cyrillic.woff2",
			"/fonts/inter/latin-ext.woff2",
			"/fonts/inter/latin.woff2",
		]);
	});

	it("returns empty array for unknown slug", () => {
		const urls = getUrlsForFont("comic-sans", MOCK_URL_MAP);
		expect(urls).toHaveLength(0);
	});

	it("filters by subsets when provided", () => {
		const urls = getUrlsForFont("inter", MOCK_URL_MAP, ["latin"]);
		expect(urls).toHaveLength(1);
		expect(urls[0]?.[0]).toBe("/fonts/inter/latin.woff2");
	});

	it("filters multiple subsets", () => {
		const urls = getUrlsForFont("inter", MOCK_URL_MAP, ["latin", "cyrillic"]);
		expect(urls).toHaveLength(2);
	});

	it("subset filter is case-insensitive match on path segment", () => {
		const urls = getUrlsForFont("inter", MOCK_URL_MAP, ["latin-ext"]);
		expect(urls).toHaveLength(1);
		expect(urls[0]?.[0]).toBe("/fonts/inter/latin-ext.woff2");
	});

	it("returns entries sorted by path", () => {
		const urls = getUrlsForFont("inter", MOCK_URL_MAP);
		const paths = urls.map(([p]) => p);
		const sorted = [...paths].sort();
		expect(paths).toEqual(sorted);
	});
});

describe("downloadFonts", () => {
	it("downloads all files to correct paths", async () => {
		const entries: Array<[string, string]> = [
			["/fonts/inter/latin.woff2", "https://cdn.example.com/inter/latin.woff2"],
		];

		const mockFetch = vi.fn().mockResolvedValue(new Response(WOFF2_BYTES, { status: 200 }));

		const result = await downloadFonts({
			entries,
			fetch: mockFetch,
			outDir: tempDir,
		});

		expect(result.downloaded).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.failed).toBe(0);
		expect(existsSync(join(tempDir, "fonts", "inter", "latin.woff2"))).toBe(true);
	});

	it("creates nested directories", async () => {
		const entries: Array<[string, string]> = [
			["/fonts/inter/latin.woff2", "https://cdn.example.com/inter/latin.woff2"],
		];

		const mockFetch = vi.fn().mockResolvedValue(new Response(WOFF2_BYTES, { status: 200 }));

		await downloadFonts({ entries, fetch: mockFetch, outDir: tempDir });

		expect(existsSync(join(tempDir, "fonts", "inter"))).toBe(true);
	});

	it("skips existing files when force is false", async () => {
		const dest = join(tempDir, "fonts", "inter");
		mkdirSync(dest, { recursive: true });
		writeFileSync(join(dest, "latin.woff2"), "existing");

		const entries: Array<[string, string]> = [
			["/fonts/inter/latin.woff2", "https://cdn.example.com/inter/latin.woff2"],
		];

		const mockFetch = vi.fn();

		const result = await downloadFonts({ entries, fetch: mockFetch, outDir: tempDir });

		expect(result.skipped).toBe(1);
		expect(result.downloaded).toBe(0);
		expect(mockFetch).not.toHaveBeenCalled();
		expect(readFileSync(join(dest, "latin.woff2"), "utf-8")).toBe("existing");
	});

	it("re-downloads existing files when force is true", async () => {
		const dest = join(tempDir, "fonts", "inter");
		mkdirSync(dest, { recursive: true });
		writeFileSync(join(dest, "latin.woff2"), "old");

		const entries: Array<[string, string]> = [
			["/fonts/inter/latin.woff2", "https://cdn.example.com/inter/latin.woff2"],
		];

		const mockFetch = vi.fn().mockResolvedValue(new Response(WOFF2_BYTES, { status: 200 }));

		const result = await downloadFonts({
			entries,
			fetch: mockFetch,
			force: true,
			outDir: tempDir,
		});

		expect(result.downloaded).toBe(1);
		expect(result.skipped).toBe(0);
		expect(mockFetch).toHaveBeenCalledOnce();
	});

	it("counts HTTP errors as failed", async () => {
		const entries: Array<[string, string]> = [
			["/fonts/inter/latin.woff2", "https://cdn.example.com/inter/latin.woff2"],
		];

		const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));

		const result = await downloadFonts({ entries, fetch: mockFetch, outDir: tempDir });

		expect(result.failed).toBe(1);
		expect(result.downloaded).toBe(0);
	});

	it("counts network errors as failed", async () => {
		const entries: Array<[string, string]> = [
			["/fonts/inter/latin.woff2", "https://cdn.example.com/inter/latin.woff2"],
		];

		const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

		const result = await downloadFonts({ entries, fetch: mockFetch, outDir: tempDir });

		expect(result.failed).toBe(1);
		expect(result.downloaded).toBe(0);
	});

	it("collects failed paths", async () => {
		const entries: Array<[string, string]> = [
			["/fonts/inter/latin.woff2", "https://cdn.example.com/inter/latin.woff2"],
			["/fonts/inter/cyrillic.woff2", "https://cdn.example.com/inter/cyrillic.woff2"],
		];

		const mockFetch = vi
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 500 }))
			.mockResolvedValueOnce(new Response(WOFF2_BYTES, { status: 200 }));

		const result = await downloadFonts({ entries, fetch: mockFetch, outDir: tempDir });

		expect(result.failed).toBe(1);
		expect(result.downloaded).toBe(1);
		expect(result.failedPaths).toEqual(["/fonts/inter/latin.woff2"]);
	});

	it("handles mixed results across batch", async () => {
		const entries: Array<[string, string]> = [
			["/fonts/inter/latin.woff2", "https://cdn.example.com/1"],
			["/fonts/inter/latin-ext.woff2", "https://cdn.example.com/2"],
			["/fonts/inter/cyrillic.woff2", "https://cdn.example.com/3"],
		];

		mkdirSync(join(tempDir, "fonts", "inter"), { recursive: true });
		writeFileSync(join(tempDir, "fonts", "inter", "latin.woff2"), "existing");

		const mockFetch = vi
			.fn()
			.mockResolvedValueOnce(new Response(WOFF2_BYTES, { status: 200 }))
			.mockRejectedValueOnce(new Error("timeout"));

		const result = await downloadFonts({ entries, fetch: mockFetch, outDir: tempDir });

		expect(result.skipped).toBe(1);
		expect(result.downloaded).toBe(1);
		expect(result.failed).toBe(1);
	});

	it("downloads in batches respecting batchSize", async () => {
		const entries: Array<[string, string]> = Array.from({ length: 15 }, (_, i) => [
			`/fonts/test/file-${i}.woff2`,
			`https://cdn.example.com/${i}`,
		]);

		let maxConcurrent = 0;
		let currentConcurrent = 0;

		const mockFetch = vi.fn().mockImplementation(async () => {
			currentConcurrent++;
			if (currentConcurrent > maxConcurrent) {
				maxConcurrent = currentConcurrent;
			}
			await new Promise((r) => setTimeout(r, 10));
			currentConcurrent--;
			return new Response(WOFF2_BYTES, { status: 200 });
		});

		const result = await downloadFonts({
			batchSize: 5,
			entries,
			fetch: mockFetch,
			outDir: tempDir,
		});

		expect(result.downloaded).toBe(15);
		expect(maxConcurrent).toBeLessThanOrEqual(5);
	});

	it("returns zero counts for empty entries", async () => {
		const mockFetch = vi.fn();
		const result = await downloadFonts({
			entries: [],
			fetch: mockFetch,
			outDir: tempDir,
		});

		expect(result.downloaded).toBe(0);
		expect(result.skipped).toBe(0);
		expect(result.failed).toBe(0);
		expect(result.failedPaths).toEqual([]);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it("calls onProgress callback per batch", async () => {
		const entries: Array<[string, string]> = Array.from({ length: 6 }, (_, i) => [
			`/fonts/test/file-${i}.woff2`,
			`https://cdn.example.com/${i}`,
		]);

		const mockFetch = vi.fn().mockResolvedValue(new Response(WOFF2_BYTES, { status: 200 }));

		const progressCalls: Array<{ completed: number; total: number }> = [];

		await downloadFonts({
			batchSize: 2,
			entries,
			fetch: mockFetch,
			onProgress(completed, total) {
				progressCalls.push({ completed, total });
			},
			outDir: tempDir,
		});

		expect(progressCalls).toHaveLength(3);
		expect(progressCalls[0]).toEqual({ completed: 2, total: 6 });
		expect(progressCalls[1]).toEqual({ completed: 4, total: 6 });
		expect(progressCalls[2]).toEqual({ completed: 6, total: 6 });
	});

	it("writes correct binary content", async () => {
		const entries: Array<[string, string]> = [
			["/fonts/inter/latin.woff2", "https://cdn.example.com/inter/latin.woff2"],
		];

		const mockFetch = vi.fn().mockResolvedValue(new Response(WOFF2_BYTES, { status: 200 }));

		await downloadFonts({ entries, fetch: mockFetch, outDir: tempDir });

		const written = readFileSync(join(tempDir, "fonts", "inter", "latin.woff2"));
		expect(Buffer.from(WOFF2_BYTES).equals(written)).toBe(true);
	});
});

const SUBSET_URL_MAP: Record<string, string> = {
	"/fonts/inter/cyrillic-ext-i.woff2": "https://cdn.example.com/1",
	"/fonts/inter/cyrillic-ext.woff2": "https://cdn.example.com/2",
	"/fonts/inter/cyrillic-i.woff2": "https://cdn.example.com/3",
	"/fonts/inter/cyrillic.woff2": "https://cdn.example.com/4",
	"/fonts/inter/latin-ext-i.woff2": "https://cdn.example.com/5",
	"/fonts/inter/latin-ext.woff2": "https://cdn.example.com/6",
	"/fonts/inter/latin-i.woff2": "https://cdn.example.com/7",
	"/fonts/inter/latin.woff2": "https://cdn.example.com/8",
	"/fonts/lora/latin-400.woff2": "https://cdn.example.com/9",
	"/fonts/lora/latin-700.woff2": "https://cdn.example.com/10",
	"/fonts/lora/latin-i-400.woff2": "https://cdn.example.com/11",
};

describe("getSubsetsForFont", () => {
	it("extracts unique subsets from variable font paths", () => {
		const subsets = getSubsetsForFont("inter", SUBSET_URL_MAP);
		expect(subsets).toEqual(["cyrillic", "cyrillic-ext", "latin", "latin-ext"]);
	});

	it("extracts subsets from static font paths with weight suffixes", () => {
		const subsets = getSubsetsForFont("lora", SUBSET_URL_MAP);
		expect(subsets).toEqual(["latin"]);
	});

	it("returns empty for unknown font", () => {
		const subsets = getSubsetsForFont("unknown", SUBSET_URL_MAP);
		expect(subsets).toEqual([]);
	});

	it("returns sorted subsets", () => {
		const subsets = getSubsetsForFont("inter", SUBSET_URL_MAP);
		const sorted = [...subsets].sort();
		expect(subsets).toEqual(sorted);
	});
});
