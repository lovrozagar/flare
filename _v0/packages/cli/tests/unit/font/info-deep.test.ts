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
	["Noto Sans JP", "noto-sans-jp", "notoSansJp", "sans-serif"],
];

const URL_MAP: Record<string, string> = {
	"/fonts/inter/cyrillic-ext-i.woff2": "https://cdn/1",
	"/fonts/inter/cyrillic-ext.woff2": "https://cdn/2",
	"/fonts/inter/cyrillic-i.woff2": "https://cdn/3",
	"/fonts/inter/cyrillic.woff2": "https://cdn/4",
	"/fonts/inter/latin-ext-i.woff2": "https://cdn/5",
	"/fonts/inter/latin-ext.woff2": "https://cdn/6",
	"/fonts/inter/latin-i.woff2": "https://cdn/7",
	"/fonts/inter/latin.woff2": "https://cdn/8",
	"/fonts/lora/latin-400.woff2": "https://cdn/9",
	"/fonts/lora/latin-700.woff2": "https://cdn/10",
	"/fonts/lora/latin-i-400.woff2": "https://cdn/11",
};

beforeEach(() => {
	tempDir = join(tmpdir(), `flare-info-deep-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(join(tempDir, "public", "fonts"), { recursive: true });
});

afterEach(() => {
	rmSync(tempDir, { force: true, recursive: true });
});

describe("getFontInfo deep tests", () => {
	it("returns correct file count for variable font with italic variants", () => {
		const info = getFontInfo("inter", REGISTRY, URL_MAP, tempDir);
		expect(info?.totalFiles).toBe(8);
	});

	it("returns correct file count for static font with weight variants", () => {
		const info = getFontInfo("lora", REGISTRY, URL_MAP, tempDir);
		expect(info?.totalFiles).toBe(3);
	});

	it("returns correct subsets for variable font", () => {
		const info = getFontInfo("inter", REGISTRY, URL_MAP, tempDir);
		expect(info?.availableSubsets).toEqual(["cyrillic", "cyrillic-ext", "latin", "latin-ext"]);
	});

	it("returns correct subsets for static font", () => {
		const info = getFontInfo("lora", REGISTRY, URL_MAP, tempDir);
		expect(info?.availableSubsets).toEqual(["latin"]);
	});

	it("font with no files in URL map returns 0 files and empty subsets", () => {
		const info = getFontInfo("noto-sans-jp", REGISTRY, URL_MAP, tempDir);
		expect(info?.totalFiles).toBe(0);
		expect(info?.availableSubsets).toEqual([]);
	});

	it("resolves by family name with mixed case", () => {
		const info = getFontInfo("INTER", REGISTRY, URL_MAP, tempDir);
		expect(info?.slug).toBe("inter");
	});

	it("resolves by family name with spaces", () => {
		const info = getFontInfo("Fira Code", REGISTRY, URL_MAP, tempDir);
		expect(info?.slug).toBe("fira-code");
		expect(info?.camelName).toBe("firaCode");
	});

	it("installed subsets reflect manifest not URL map", () => {
		addFont(tempDir, "inter", "Inter", ["latin"]);

		const info = getFontInfo("inter", REGISTRY, URL_MAP, tempDir);
		expect(info?.installed).toBe(true);
		expect(info?.installedSubsets).toEqual(["latin"]);
		/* available subsets still shows all from URL map */
		expect(info?.availableSubsets).toEqual(["cyrillic", "cyrillic-ext", "latin", "latin-ext"]);
	});

	it("import snippet format is consistent", () => {
		const info = getFontInfo("fira-code", REGISTRY, URL_MAP, tempDir);
		expect(info?.importSnippet).toMatch(/^import \{ \w+ \} from "@lovrozagar\/flare\/fonts\/[a-z0-9-]+"$/);
	});

	it("all fields present in result", () => {
		const info = getFontInfo("inter", REGISTRY, URL_MAP, tempDir);
		expect(info).toHaveProperty("availableSubsets");
		expect(info).toHaveProperty("camelName");
		expect(info).toHaveProperty("category");
		expect(info).toHaveProperty("family");
		expect(info).toHaveProperty("importSnippet");
		expect(info).toHaveProperty("installed");
		expect(info).toHaveProperty("installedSubsets");
		expect(info).toHaveProperty("slug");
		expect(info).toHaveProperty("totalFiles");
	});
});
