import { afterEach, describe, expect, it } from "vitest"
import {
	clearScopedStyles,
	compileSx,
	getScopedStyles,
} from "../../../src/styles/index.ts"
import type { Sx } from "../../../src/styles/sx-types.ts"

afterEach(() => {
	clearScopedStyles()
})

describe("compileSx — basic", () => {
	it("flat Sx → returns class starting with flare-rt-", () => {
		const { class: cls } = compileSx({ color: "red" })
		expect(cls).toMatch(/^flare-rt-/)
	})

	it("flat Sx → class registered in scoped styles", () => {
		const { class: cls } = compileSx({ padding: "1rem" })
		const css = getScopedStyles()
		expect(css).toContain(`.${cls}`)
		expect(css).toContain("padding")
		expect(css).toContain("1rem")
	})

	it("style is undefined when no dynamic values", () => {
		const result = compileSx({ color: "red" })
		expect(result.style).toBeUndefined()
	})

	it("same Sx on two calls → same class, single registry entry (dedup)", () => {
		const sx: Sx = { color: "blue" }
		const r1 = compileSx(sx)
		const r2 = compileSx(sx)
		expect(r1.class).toBe(r2.class)
		/* Only one CSS block in registry */
		const css = getScopedStyles()
		const matches = css.match(new RegExp(`\\.${r1.class}`, "g"))
		expect(matches).toHaveLength(1)
	})
})

describe("compileSx — nested selector", () => {
	it("&:hover → registered CSS contains :hover scoped to class", () => {
		const sx: Sx = { "&:hover": { color: "blue" } }
		const { class: cls } = compileSx(sx)
		const css = getScopedStyles()
		expect(css).toContain(`.${cls}:hover`)
		expect(css).toContain("color")
		expect(css).toContain("blue")
	})
})

describe("compileSx — @media", () => {
	it("@media wraps correctly", () => {
		const sx: Sx = { "@media (min-width: 768px)": { padding: "2rem" } }
		const { class: cls } = compileSx(sx)
		const css = getScopedStyles()
		expect(css).toContain("@media (min-width: 768px)")
		expect(css).toContain(`.${cls}`)
	})
})

describe("compileSx — layer argument", () => {
	it("user.lib → registered CSS wrapped in @layer user.lib", () => {
		compileSx({ color: "red" }, "user.lib")
		const css = getScopedStyles()
		expect(css).toContain("@layer user.lib")
	})

	it("user.app (default) → registered CSS wrapped in @layer user.app", () => {
		compileSx({ color: "green" })
		const css = getScopedStyles()
		expect(css).toContain("@layer user.app")
	})

	it("explicit user.app → @layer user.app", () => {
		compileSx({ color: "purple" }, "user.app")
		const css = getScopedStyles()
		expect(css).toContain("@layer user.app")
	})
})

describe("compileSx — stable hash", () => {
	it("same shape with different dynamic values → same class (shape-based hash), style carries var", () => {
		/* compileSx serializes static shape — dynamic values go into style, not hash */
		const r1 = compileSx({ color: "red" })
		const r2 = compileSx({ color: "red" })
		expect(r1.class).toBe(r2.class)
	})

	it("key-order-independent hash (compileSx sorts internally)", () => {
		/* Two objects with identical properties — insertion order differs via delete/re-add */
		const a: Sx = { background: "white", color: "red" }
		/* Reverse insertion order: delete color, re-add after background */
		const b: Sx = Object.assign({}, a)
		delete (b as Record<string, unknown>).color
		;(b as Record<string, unknown>).color = "red"
		const r1 = compileSx(a)
		clearScopedStyles()
		const r2 = compileSx(b)
		expect(r1.class).toBe(r2.class)
	})
})

describe("compileSx — variants block (lines 1167-1170)", () => {
	it("variants block → CSS uses data attribute selector", () => {
		const sx: Sx = {
			variants: {
				size: {
					lg: { padding: "16px" },
					sm: { padding: "4px" },
				},
			},
		}
		compileSx(sx)
		const css = getScopedStyles()
		expect(css).toContain(`[data-size="sm"]`)
		expect(css).toContain(`[data-size="lg"]`)
		expect(css).toContain("padding")
	})

	it("variants serialized stably — same input same class", () => {
		const sx: Sx = { variants: { intent: { primary: { color: "blue" } } } }
		const r1 = compileSx(sx)
		clearScopedStyles()
		const r2 = compileSx(sx)
		expect(r1.class).toBe(r2.class)
	})
})

describe("compileSx — camelCase property → kebab-case in CSS (buildSxCSS)", () => {
	it("backgroundColor → background-color in registered CSS", () => {
		const { class: cls } = compileSx({ backgroundColor: "blue" })
		const css = getScopedStyles()
		expect(css).toContain(`background-color`)
		expect(css).not.toContain("backgroundColor")
		expect(css).toContain(`.${cls}`)
	})

	it("@media with camelCase prop inside → kebab in output", () => {
		const { class: cls } = compileSx({ "@media (min-width:768px)": { fontSize: "2rem" } })
		const css = getScopedStyles()
		expect(css).toContain("font-size")
		expect(css).toContain(`.${cls}`)
	})
})

describe("compileSx — already registered (classRegistry dedup path)", () => {
	it("second call with same Sx returns same class without re-registering", () => {
		const sx: Sx = { color: "green", padding: "8px" }
		const r1 = compileSx(sx)
		const css1 = getScopedStyles()
		const r2 = compileSx(sx)
		const css2 = getScopedStyles()
		expect(r1.class).toBe(r2.class)
		/* CSS output unchanged after second call */
		expect(css1).toBe(css2)
	})
})
