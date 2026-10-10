import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getFontInfo } from "../../../src/font/info";
import type { FontEntry } from "../../../src/font/resolve";
import { addFont } from "../../../src/font/tracking";

let tempDir: string;

const REGISTRY: FontEntry[] = [
	["Inter", "inter", "inter", "sans-serif"],
	["Lora", "lora", "lora", "serif"],
	["Fira Code", "fira-code", "firaCode", "monospace"],
];

const URL_MAP: Record<string, string> = {
	"/fonts/inter/cyrillic.woff2": "https://cdn.example.com/1",
	"/fonts/inter/latin-ext.woff2": "https://cdn.example.com/2",
	"/fonts/inter/latin-i.woff2": "https://cdn.example.com/4",
	"/fonts/inter/latin.woff2": "https://cdn.example.com/3",
	"/fonts/lora/latin.woff2": "https://cdn.example.com/5",
};

beforeEach(() => {
	tempDir = join(tmpdir(), `flare-info-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(join(tempDir, "public", "fonts"), { recursive: true });
});

afterEach(() => {
	rmSync(tempDir, { force: true, recursive: true });
});

describe("getFontInfo", () => {
	it("returns null for unknown font", () => {
		const result = getFontInfo("comic-sans", REGISTRY, URL_MAP, tempDir);
		expect(result).toBeNull();
	});

	it("returns info for known font", () => {
		const result = getFontInfo("inter", REGISTRY, URL_MAP, tempDir);
		expect(result).toBeDefined();
		expect(result?.family).toBe("Inter");
		expect(result?.slug).toBe("inter");
		expect(result?.category).toBe("sans-serif");
	});

	it("resolves by family name", () => {
		const result = getFontInfo("Inter", REGISTRY, URL_MAP, tempDir);
		expect(result?.slug).toBe("inter");
	});

	it("lists available subsets from URL map", () => {
		const result = getFontInfo("inter", REGISTRY, URL_MAP, tempDir);
		expect(result?.availableSubsets).toEqual(["cyrillic", "latin", "latin-ext"]);
	});

	it("counts total files from URL map", () => {
		const result = getFontInfo("inter", REGISTRY, URL_MAP, tempDir);
		expect(result?.totalFiles).toBe(4);
	});

	it("reports installed=false when not in manifest", () => {
		const result = getFontInfo("inter", REGISTRY, URL_MAP, tempDir);
		expect(result?.installed).toBe(false);
		expect(result?.installedSubsets).toEqual([]);
	});

	it("reports installed=true when in manifest", () => {
		addFont(tempDir, "inter", "Inter", ["latin", "cyrillic"]);

		const result = getFontInfo("inter", REGISTRY, URL_MAP, tempDir);
		expect(result?.installed).toBe(true);
		expect(result?.installedSubsets).toEqual(["latin", "cyrillic"]);
	});

	it("provides import snippet", () => {
		const result = getFontInfo("inter", REGISTRY, URL_MAP, tempDir);
		expect(result?.importSnippet).toBe(`import { inter } from "@lovrozagar/flare/fonts/inter"`);
	});

	it("uses camelName in import snippet", () => {
		const result = getFontInfo("fira-code", REGISTRY, URL_MAP, tempDir);
		expect(result?.importSnippet).toBe(`import { firaCode } from "@lovrozagar/flare/fonts/fira-code"`);
	});
});
