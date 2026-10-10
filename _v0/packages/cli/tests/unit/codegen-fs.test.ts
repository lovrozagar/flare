import { describe, expect, it } from "vitest";
import { resolveCodegenFs } from "../../src/commands/codegen.ts";

describe("resolveCodegenFs", () => {
	it("--fs forces filesystem mode even on a string-style project", () => {
		expect(resolveCodegenFs(true, false)).toBe(true);
	});

	it("without --fs uses suffix-file detection", () => {
		expect(resolveCodegenFs(undefined, true)).toBe(true);
		expect(resolveCodegenFs(undefined, false)).toBe(false);
	});

	it("explicit --fs false is not how commander works; undefined defers to project", () => {
		expect(resolveCodegenFs(undefined, false)).toBe(false);
	});
});
