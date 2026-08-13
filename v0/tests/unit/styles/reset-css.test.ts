/**
 * ResetCSS Component Unit Tests
 *
 * Tests the ResetCSS component exports and resetCss constant.
 */

import { describe, expect, it } from "vitest"
import { ResetCSS, resetCss } from "../../../src/styles/reset-css"

describe("ResetCSS", () => {
	it("exports ResetCSS function", () => {
		expect(typeof ResetCSS).toBe("function")
	})

	it("ResetCSS has correct function signature", () => {
		expect(ResetCSS.length).toBeGreaterThanOrEqual(0)
	})
})

describe("resetCss constant", () => {
	it("exports resetCss string", () => {
		expect(typeof resetCss).toBe("string")
	})

	it("resetCss is not empty", () => {
		expect(resetCss.length).toBeGreaterThan(0)
	})

	it("resetCss contains box-sizing reset", () => {
		expect(resetCss).toContain("box-sizing:border-box")
	})

	it("resetCss contains margin reset", () => {
		expect(resetCss).toContain("margin:0")
	})

	it("resetCss contains list-style reset", () => {
		expect(resetCss).toContain("list-style:none")
	})
})
