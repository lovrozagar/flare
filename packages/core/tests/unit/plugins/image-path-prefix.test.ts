import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isPathWithinRoot } from "../../../src/plugins/image-plugin.ts";

describe("isPathWithinRoot — prefix match is not containment", () => {
	it("allows a file inside the root", () => {
		expect(isPathWithinRoot("/proj/flare/src/hero.png", "/proj/flare")).toBe(true);
	});

	it("allows a nested file inside the root", () => {
		expect(isPathWithinRoot("/proj/flare/e2e/apps/product/src/assets/x.jpg", "/proj/flare")).toBe(true);
	});

	it("rejects a sibling directory that shares a string prefix", () => {
		expect(isPathWithinRoot("/proj/flare-evil/secret.png", "/proj/flare")).toBe(false);
	});

	it("rejects a parent path", () => {
		expect(isPathWithinRoot("/proj/secret.png", "/proj/flare")).toBe(false);
	});

	it("rejects an unrelated absolute path", () => {
		expect(isPathWithinRoot("/etc/passwd", "/proj/flare")).toBe(false);
	});

	it("does not treat a file named with leading dots as escaping the root", () => {
		expect(isPathWithinRoot("/proj/flare/...secret.png", "/proj/flare")).toBe(true);
	});
});

describe("image plugin uses path containment, not startsWith(cwd)", () => {
	it("configureServer checks realpath with isPathWithinRoot", () => {
		const src = readFileSync(join(__dirname, "../../../src/plugins/image-plugin.ts"), "utf-8");
		expect(src).toContain("isPathWithinRoot(resolvedSrc");
		expect(src).toContain("isPathWithinRoot(realSrc");
		expect(src).not.toMatch(/startsWith\(process\.cwd\(\)\)/);
	});
});
