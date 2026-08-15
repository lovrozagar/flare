import { describe, expect, it } from "vitest";
import { shouldTriggerGenerate } from "../../../src/plugins/generate-watch.ts";

describe("shouldTriggerGenerate — fsVirtualPaths true", () => {
	it("ignores null/empty filename", () => {
		expect(shouldTriggerGenerate(null, "change", true)).toBe(false);
		expect(shouldTriggerGenerate(undefined, "change", true)).toBe(false);
		expect(shouldTriggerGenerate("", "change", true)).toBe(false);
	});

	it("ignores _gen and *.gen.ts", () => {
		expect(shouldTriggerGenerate("src/_gen/routes.gen.ts", "change", true)).toBe(false);
		expect(shouldTriggerGenerate("_gen/types.gen.d.ts", "rename", true)).toBe(false);
		expect(shouldTriggerGenerate("src/routes/_root_/foo.gen.ts", "change", true)).toBe(false);
	});

	it("triggers on suffix file change", () => {
		expect(shouldTriggerGenerate("routes/_root_/about/about.page.tsx", "change", true)).toBe(true);
		expect(shouldTriggerGenerate("routes/_root_/blog.layout.ts", "change", true)).toBe(true);
		expect(shouldTriggerGenerate("routes/_root_/root.root-layout.tsx", "change", true)).toBe(true);
		expect(shouldTriggerGenerate("routes/_root_/[id]/id.path-segment.tsx", "change", true)).toBe(true);
		expect(shouldTriggerGenerate("about.page.jsx", "change", true)).toBe(true);
		expect(shouldTriggerGenerate("about.page.js", "change", true)).toBe(true);
	});

	it("ignores Windows-style _gen paths", () => {
		expect(shouldTriggerGenerate("src\\_gen\\routes.gen.ts", "change", true)).toBe(false);
	});

	it("does not trigger on helper or string-style change", () => {
		expect(shouldTriggerGenerate("routes/_root_/about/Button.tsx", "change", true)).toBe(false);
		expect(shouldTriggerGenerate("routes/about.tsx", "change", true)).toBe(false);
		expect(shouldTriggerGenerate("routes/_root_.tsx", "change", true)).toBe(false);
		expect(shouldTriggerGenerate("routes/dashboard/_layout_.tsx", "change", true)).toBe(false);
	});

	it("triggers on rename/delete even for non-suffix files", () => {
		expect(shouldTriggerGenerate("routes/about.tsx", "rename", true)).toBe(true);
		expect(shouldTriggerGenerate("routes/_root_/about/Button.tsx", "rename", true)).toBe(true);
	});
});

describe("shouldTriggerGenerate — fsVirtualPaths false", () => {
	it("triggers on any non-generated source change", () => {
		expect(shouldTriggerGenerate("routes/about.tsx", "change", false)).toBe(true);
		expect(shouldTriggerGenerate("routes/_root_.tsx", "change", false)).toBe(true);
		expect(shouldTriggerGenerate("routes/dashboard/_layout_.tsx", "change", false)).toBe(true);
		expect(shouldTriggerGenerate("routes/_root_/about/about.page.tsx", "change", false)).toBe(true);
		expect(shouldTriggerGenerate("lib/helpers.ts", "change", false)).toBe(true);
	});

	it("still ignores _gen output", () => {
		expect(shouldTriggerGenerate("src/_gen/routes.gen.ts", "change", false)).toBe(false);
		expect(shouldTriggerGenerate("foo.gen.tsx", "change", false)).toBe(false);
	});

	it("triggers on rename", () => {
		expect(shouldTriggerGenerate("routes/about.tsx", "rename", false)).toBe(true);
	});
});
