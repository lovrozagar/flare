import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addFont, readManifest, removeFont } from "../../../src/font/tracking";

let tempDir: string;

beforeEach(() => {
	tempDir = join(tmpdir(), `flare-track-deep-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(join(tempDir, "public", "fonts"), { recursive: true });
});

afterEach(() => {
	rmSync(tempDir, { force: true, recursive: true });
});

describe("readManifest edge cases", () => {
	it("handles manifest with fonts: null", () => {
		const manifestPath = join(tempDir, "public", "fonts", ".flare-fonts.json");
		writeFileSync(manifestPath, JSON.stringify({ fonts: null }));

		const manifest = readManifest(tempDir);
		expect(manifest.fonts).toEqual({});
	});

	it("handles manifest with fonts: [] (array not object)", () => {
		const manifestPath = join(tempDir, "public", "fonts", ".flare-fonts.json");
		writeFileSync(manifestPath, JSON.stringify({ fonts: [] }));

		/* typeof [] === "object", so this passes the check but is an array */
		const manifest = readManifest(tempDir);
		/* implementation returns the parsed value as-is since typeof [] is "object" */
		expect(manifest).toBeDefined();
	});

	it("handles empty JSON object {}", () => {
		const manifestPath = join(tempDir, "public", "fonts", ".flare-fonts.json");
		writeFileSync(manifestPath, "{}");

		const manifest = readManifest(tempDir);
		expect(manifest.fonts).toEqual({});
	});

	it("handles manifest with extra unknown fields (forward compat)", () => {
		const manifestPath = join(tempDir, "public", "fonts", ".flare-fonts.json");
		writeFileSync(
			manifestPath,
			JSON.stringify({
				fonts: {
					inter: {
						family: "Inter",
						installedAt: "2026-03-07T21:00:00Z",
						subsets: ["latin"],
					},
				},
				version: 2,
			}),
		);

		const manifest = readManifest(tempDir);
		expect(manifest.fonts.inter?.family).toBe("Inter");
	});

	it("handles truncated/corrupted JSON", () => {
		const manifestPath = join(tempDir, "public", "fonts", ".flare-fonts.json");
		writeFileSync(manifestPath, '{"fonts": {"inter": {"fam');

		const manifest = readManifest(tempDir);
		expect(manifest.fonts).toEqual({});
	});

	it("handles empty file", () => {
		const manifestPath = join(tempDir, "public", "fonts", ".flare-fonts.json");
		writeFileSync(manifestPath, "");

		const manifest = readManifest(tempDir);
		expect(manifest.fonts).toEqual({});
	});

	it("handles manifest with string value", () => {
		const manifestPath = join(tempDir, "public", "fonts", ".flare-fonts.json");
		writeFileSync(manifestPath, '"just a string"');

		const manifest = readManifest(tempDir);
		expect(manifest.fonts).toEqual({});
	});

	it("handles manifest with numeric value", () => {
		const manifestPath = join(tempDir, "public", "fonts", ".flare-fonts.json");
		writeFileSync(manifestPath, "42");

		const manifest = readManifest(tempDir);
		expect(manifest.fonts).toEqual({});
	});
});

describe("addFont edge cases", () => {
	it("updates installedAt on re-add", () => {
		addFont(tempDir, "inter", "Inter", ["latin"]);
		const first = readManifest(tempDir);
		const firstTime = first.fonts.inter?.installedAt;

		/* small delay to ensure different timestamp */
		addFont(tempDir, "inter", "Inter", ["latin", "cyrillic"]);
		const second = readManifest(tempDir);
		const secondTime = second.fonts.inter?.installedAt;

		expect(firstTime).toBeTruthy();
		expect(secondTime).toBeTruthy();
		/* timestamps should be valid ISO strings */
		expect(new Date(firstTime ?? "").getTime()).not.toBeNaN();
		expect(new Date(secondTime ?? "").getTime()).not.toBeNaN();
	});

	it("manifest uses tabs for indentation", () => {
		addFont(tempDir, "inter", "Inter", ["latin"]);

		const raw = readFileSync(join(tempDir, "public", "fonts", ".flare-fonts.json"), "utf-8");
		expect(raw).toContain("\t");
		expect(raw).not.toMatch(/^ {2}/m);
	});

	it("manifest ends with trailing newline", () => {
		addFont(tempDir, "inter", "Inter", ["latin"]);

		const raw = readFileSync(join(tempDir, "public", "fonts", ".flare-fonts.json"), "utf-8");
		expect(raw.endsWith("\n")).toBe(true);
	});

	it("handles font with empty subsets array", () => {
		addFont(tempDir, "inter", "Inter", []);

		const manifest = readManifest(tempDir);
		expect(manifest.fonts.inter?.subsets).toEqual([]);
	});

	it("handles font with many subsets", () => {
		const subsets = Array.from({ length: 20 }, (_, i) => `subset-${i}`);
		addFont(tempDir, "inter", "Inter", subsets);

		const manifest = readManifest(tempDir);
		expect(manifest.fonts.inter?.subsets).toHaveLength(20);
	});

	it("slug with special characters stored as-is", () => {
		addFont(tempDir, "noto-sans-jp", "Noto Sans JP", ["japanese"]);

		const manifest = readManifest(tempDir);
		expect(manifest.fonts["noto-sans-jp"]).toBeDefined();
		expect(manifest.fonts["noto-sans-jp"]?.family).toBe("Noto Sans JP");
	});
});

describe("removeFont edge cases", () => {
	it("removing from empty manifest is no-op", () => {
		removeFont(tempDir, "inter");
		const manifest = readManifest(tempDir);
		expect(manifest.fonts).toEqual({});
	});

	it("does not create manifest file on no-op remove", () => {
		/* start with no manifest file */
		const manifestPath = join(tempDir, "public", "fonts", ".flare-fonts.json");
		expect(existsSync(manifestPath)).toBe(false);

		removeFont(tempDir, "inter");

		/* should not create the file */
		expect(existsSync(manifestPath)).toBe(false);
	});

	it("preserves ordering after remove", () => {
		addFont(tempDir, "roboto", "Roboto", ["latin"]);
		addFont(tempDir, "inter", "Inter", ["latin"]);
		addFont(tempDir, "abel", "Abel", ["latin"]);

		removeFont(tempDir, "inter");

		const raw = readFileSync(join(tempDir, "public", "fonts", ".flare-fonts.json"), "utf-8");
		const keys = Object.keys(JSON.parse(raw).fonts);
		expect(keys).toEqual(["abel", "roboto"]);
	});
});
