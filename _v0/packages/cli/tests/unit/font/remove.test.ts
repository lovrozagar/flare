import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fontRemoveBySlug } from "../../../src/font/remove";
import { addFont, readManifest } from "../../../src/font/tracking";

let tempDir: string;

beforeEach(() => {
	tempDir = join(tmpdir(), `flare-rm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(join(tempDir, "public", "fonts"), { recursive: true });
});

afterEach(() => {
	rmSync(tempDir, { force: true, recursive: true });
});

function installFakeFont(slug: string, subsets: string[]): void {
	const fontDir = join(tempDir, "public", "fonts", slug);
	mkdirSync(fontDir, { recursive: true });
	for (const subset of subsets) {
		writeFileSync(join(fontDir, `${subset}.woff2`), "fake");
	}
	addFont(tempDir, slug, slug.charAt(0).toUpperCase() + slug.slice(1), subsets);
}

describe("fontRemoveBySlug", () => {
	it("removes font directory and manifest entry", () => {
		installFakeFont("inter", ["latin", "cyrillic"]);

		fontRemoveBySlug(tempDir, "inter");

		const manifest = readManifest(tempDir);
		expect(manifest.fonts.inter).toBeUndefined();
		expect(existsSync(join(tempDir, "public", "fonts", "inter"))).toBe(false);
	});

	it("leaves other fonts intact", () => {
		installFakeFont("inter", ["latin"]);
		installFakeFont("lora", ["latin"]);

		fontRemoveBySlug(tempDir, "inter");

		const manifest = readManifest(tempDir);
		expect(manifest.fonts.lora).toBeDefined();
		expect(existsSync(join(tempDir, "public", "fonts", "lora"))).toBe(true);
	});

	it("handles non-existent font gracefully", () => {
		installFakeFont("inter", ["latin"]);

		fontRemoveBySlug(tempDir, "comic-sans");

		const manifest = readManifest(tempDir);
		expect(manifest.fonts.inter).toBeDefined();
	});

	it("removes font directory even if not in manifest", () => {
		const fontDir = join(tempDir, "public", "fonts", "orphan");
		mkdirSync(fontDir, { recursive: true });
		writeFileSync(join(fontDir, "latin.woff2"), "fake");

		fontRemoveBySlug(tempDir, "orphan");

		expect(existsSync(fontDir)).toBe(false);
	});

	it("removes manifest entry even if directory does not exist", () => {
		addFont(tempDir, "ghost", "Ghost", ["latin"]);

		fontRemoveBySlug(tempDir, "ghost");

		const manifest = readManifest(tempDir);
		expect(manifest.fonts.ghost).toBeUndefined();
	});

	it("removes all font files including italic and weight variants", () => {
		const fontDir = join(tempDir, "public", "fonts", "inter");
		mkdirSync(fontDir, { recursive: true });
		writeFileSync(join(fontDir, "latin.woff2"), "fake");
		writeFileSync(join(fontDir, "latin-i.woff2"), "fake");
		writeFileSync(join(fontDir, "cyrillic-400.woff2"), "fake");
		addFont(tempDir, "inter", "Inter", ["latin", "cyrillic"]);

		fontRemoveBySlug(tempDir, "inter");

		expect(existsSync(fontDir)).toBe(false);
	});
});
