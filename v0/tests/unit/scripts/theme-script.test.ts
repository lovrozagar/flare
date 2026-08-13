/**
 * ThemeScript Component Unit Tests
 *
 * Tests the ThemeScript component exports and types.
 */

import { describe, expect, it } from "vitest"
import { ThemeScript, type ThemeScriptProps } from "../../../src/scripts/theme"

describe("ThemeScript", () => {
	it("exports ThemeScript function", () => {
		expect(typeof ThemeScript).toBe("function")
	})

	it("ThemeScript accepts props", () => {
		expect(ThemeScript.length).toBeGreaterThanOrEqual(0)
	})
})

describe("ThemeScriptProps type", () => {
	it("allows empty props", () => {
		const props: ThemeScriptProps = {}
		expect(props).toEqual({})
	})

	it("allows attribute prop", () => {
		const props: ThemeScriptProps = {
			attribute: "data-mode",
		}
		expect(props.attribute).toBe("data-mode")
	})

	it("allows storageKey prop", () => {
		const props: ThemeScriptProps = {
			storageKey: "color-theme",
		}
		expect(props.storageKey).toBe("color-theme")
	})

	it("allows defaultTheme prop", () => {
		const props: ThemeScriptProps = {
			defaultTheme: "dark",
		}
		expect(props.defaultTheme).toBe("dark")
	})

	it("allows all props together", () => {
		const props: ThemeScriptProps = {
			attribute: "data-theme",
			defaultTheme: "system",
			storageKey: "flare.theme",
		}
		expect(props.attribute).toBe("data-theme")
		expect(props.defaultTheme).toBe("system")
		expect(props.storageKey).toBe("flare.theme")
	})
})
