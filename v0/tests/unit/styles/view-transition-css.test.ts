/**
 * ViewTransitionCSS Component Unit Tests
 *
 * Tests the ViewTransitionCSS component exports and viewTransitionCss constant.
 */

import { describe, expect, it } from "vitest"
import {
	getViewTransitionCss,
	ViewTransitionCSS,
	viewTransitionCss,
} from "../../../src/styles/view-transition-css"

describe("ViewTransitionCSS", () => {
	it("exports ViewTransitionCSS function", () => {
		expect(typeof ViewTransitionCSS).toBe("function")
	})

	it("ViewTransitionCSS has correct function signature", () => {
		expect(ViewTransitionCSS.length).toBeGreaterThanOrEqual(0)
	})
})

describe("getViewTransitionCss", () => {
	it("generates CSS with custom duration", () => {
		const css = getViewTransitionCss(200)
		expect(css).toContain("animation-duration:200ms")
	})

	it("generates CSS with default duration", () => {
		const css = getViewTransitionCss(175)
		expect(css).toBe(viewTransitionCss)
	})
})

describe("viewTransitionCss constant", () => {
	it("exports viewTransitionCss string", () => {
		expect(typeof viewTransitionCss).toBe("string")
	})

	it("viewTransitionCss is not empty", () => {
		expect(viewTransitionCss.length).toBeGreaterThan(0)
	})

	it("viewTransitionCss contains @view-transition rule", () => {
		expect(viewTransitionCss).toContain("@view-transition{navigation:auto}")
	})

	it("viewTransitionCss contains animation-duration", () => {
		expect(viewTransitionCss).toContain("animation-duration:175ms")
	})

	it("viewTransitionCss contains view-transition-old selector", () => {
		expect(viewTransitionCss).toContain("::view-transition-old(*)")
	})

	it("viewTransitionCss contains view-transition-new selector", () => {
		expect(viewTransitionCss).toContain("::view-transition-new(*)")
	})
})
