/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { RESET } from "../../../src/components/reset-css.tsx";
import { resetCss } from "../../../src/components/index.ts";

describe("RESET const — @layer reset wrap", () => {
	it("starts with @layer reset {", () => {
		expect(RESET.startsWith("@layer reset {")).toBe(true);
	});

	it("ends with }", () => {
		expect(RESET.trimEnd().endsWith("}")).toBe(true);
	});

	it("still contains box-sizing reset", () => {
		expect(RESET).toContain("box-sizing");
	});
});

describe("resetCss const — @layer reset wrap", () => {
	it("starts with @layer reset {", () => {
		expect(resetCss.startsWith("@layer reset {")).toBe(true);
	});

	it("ends with }", () => {
		expect(resetCss.trimEnd().endsWith("}")).toBe(true);
	});

	it("still contains box-sizing reset", () => {
		expect(resetCss).toContain("box-sizing");
	});
});
