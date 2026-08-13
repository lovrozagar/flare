import { afterEach, describe, expect, it } from "vitest"
import {
	clearScopedStyles,
	enableDomInjection,
	getScopedStyles,
	registerCSS,
	registerCSSByName,
	styles,
} from "../../../src/styles/index.ts"

afterEach(() => {
	clearScopedStyles()
})

describe("styles (simple string)", () => {
	it("returns data-c attribute", () => {
		const result = styles("box", "padding: 1rem")
		expect(result["data-c"]).toBe("box")
	})

	it("registers scoped CSS", () => {
		styles("box", "padding: 1rem")
		const css = getScopedStyles()
		expect(css).toContain('[data-c="box"]')
		expect(css).toContain("padding:1rem")
	})

	it("handles empty string", () => {
		const result = styles("empty", "")
		expect(result["data-c"]).toBe("empty")
	})
})

describe("styles (config object)", () => {
	it("state adds data attributes", () => {
		const result = styles("btn", {
			css: "background: gray",
			state: { active: true, size: "lg" },
		})
		expect(result["data-c"]).toBe("btn")
		expect(result["data-active"]).toBe("true")
		expect(result["data-size"]).toBe("lg")
	})

	it("vars adds inline style with indexed names", () => {
		const result = styles("item", {
			css: (_, v) => `color: ${v.color}; background: ${v.bg}`,
			vars: { bg: "blue", color: "red" },
		})
		expect(result.style).toBeDefined()
		/* keys sorted alphabetically: bg=0, color=1 */
		expect(result.style?.["--_0"]).toBe("blue")
		expect(result.style?.["--_1"]).toBe("red")
	})

	it("css as string registers scoped CSS", () => {
		styles("card", { css: "padding: 2rem" })
		expect(getScopedStyles()).toContain("padding:2rem")
	})

	it("css function receives state selectors and var accessors", () => {
		styles("test", {
			css: (s, v) => `
				background: gray;
				${s.active(true)} { background: blue }
				color: ${v.color}
			`,
			state: { active: false },
			vars: { color: "red" },
		})
		const css = getScopedStyles()
		expect(css).toContain("background:gray")
		expect(css).toContain('[data-active="true"]')
		expect(css).toContain("var(--_0)")
	})

	it("tw prepended before css", () => {
		styles("card", {
			css: "color: red",
			tw: "display: flex; gap: 1rem",
		})
		const css = getScopedStyles()
		expect(css).toContain("display:flex")
		expect(css).toContain("color:red")
	})

	it("outerCss appended after inner CSS with hashed name", () => {
		const result = styles("card", {
			css: "padding: 1rem",
			outerCss: "margin: 2rem",
		})
		/* name should be hashed when outerCss present */
		expect(result["data-c"]).toContain("card-")
		const css = getScopedStyles()
		expect(css).toContain("padding:1rem")
		expect(css).toContain("margin:2rem")
	})

	it("style merged with var styles", () => {
		const result = styles("merge", {
			style: { display: "flex" },
			vars: { color: "red" },
		})
		expect(result.style?.display).toBe("flex")
		expect(result.style?.["--_0"]).toBe("red")
	})
})

describe("state selectors", () => {
	it("generates attribute selectors", () => {
		styles("sel", {
			css: (s) => `${s.active(true)} { color: blue } ${s.size("lg")} { font-size: 2rem }`,
			state: { active: false, size: "sm" },
		})
		const css = getScopedStyles()
		expect(css).toContain('[data-active="true"]')
		expect(css).toContain('[data-size="lg"]')
	})

	it("state values become data attributes", () => {
		const result = styles("attrs", {
			state: { active: true },
		})
		expect(result["data-active"]).toBe("true")
	})
})

describe("CSS variables", () => {
	it("first var is --_0", () => {
		styles("v1", {
			css: (_, v) => `color: ${v.color}`,
			vars: { color: "red" },
		})
		expect(getScopedStyles()).toContain("var(--_0)")
	})

	it("second var is --_1", () => {
		styles("v2", {
			css: (_, v) => `color: ${v.a}; background: ${v.b}`,
			vars: { a: "red", b: "blue" },
		})
		const css = getScopedStyles()
		expect(css).toContain("var(--_0)")
		expect(css).toContain("var(--_1)")
	})

	it("var values become inline style", () => {
		const result = styles("vstyle", {
			vars: { color: "red" },
		})
		expect(result.style?.["--_0"]).toBe("red")
	})
})

describe("CSS scoping", () => {
	it("plain declarations wrapped", () => {
		registerCSSByName("test", "padding: 1rem; margin: 0")
		expect(getScopedStyles()).toContain('[data-c="test"]{padding:1rem;margin:0}')
	})

	it("& rules replaced with scope", () => {
		registerCSSByName("test", "&:hover { color: red }")
		expect(getScopedStyles()).toContain('[data-c="test"]:hover{color:red}')
	})

	it("& attribute selectors replaced", () => {
		registerCSSByName("test", '&[data-x="1"] { color: red }')
		expect(getScopedStyles()).toContain('[data-c="test"][data-x="1"]{color:red}')
	})

	it("@media wraps scoped content", () => {
		registerCSSByName("test", "@media (min-width: 768px) { padding: 2rem }")
		const css = getScopedStyles()
		expect(css).toContain("@media (min-width: 768px)")
		expect(css).toContain('[data-c="test"]')
		expect(css).toContain("padding:2rem")
	})

	it("@keyframes passed through unscoped", () => {
		registerCSSByName(
			"test",
			"@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }",
		)
		const css = getScopedStyles()
		expect(css).toContain("@keyframes spin")
	})
})

describe("CSS scoping — brace matching with quotes/comments", () => {
	it("handles closing brace inside string literal", () => {
		registerCSSByName("test", '.icon::after { content: "}"; color: red }')
		const css = getScopedStyles()
		expect(css).toContain('content:"}"')
		expect(css).toContain("color:red")
	})

	it("handles closing brace inside single-quoted string", () => {
		registerCSSByName("test", ".icon::after { content: '}'; color: blue }")
		const css = getScopedStyles()
		expect(css).toContain("content:'}'")
		expect(css).toContain("color:blue")
	})

	it("handles closing brace inside block comment", () => {
		registerCSSByName("test", ".icon { /* } not a brace */ color: red }")
		const css = getScopedStyles()
		expect(css).toContain("color:red")
		/* comments are stripped by minification */
		expect(css).not.toContain("/* } not a brace */")
	})

	it("handles escaped quote inside string literal", () => {
		registerCSSByName("test", '.icon { content: "a\\"}" ; color: red }')
		const css = getScopedStyles()
		expect(css).toContain("color:red")
	})
})

describe("CSS scoping — non-& selectors preserved", () => {
	it("preserves .class selector as descendant", () => {
		registerCSSByName("test", ".title { font-weight: bold }")
		const css = getScopedStyles()
		expect(css).toContain('[data-c="test"] .title{font-weight:bold}')
	})

	it("preserves element selector as descendant", () => {
		registerCSSByName("test", "p { margin: 0 }")
		const css = getScopedStyles()
		expect(css).toContain('[data-c="test"] p{margin:0}')
	})

	it("preserves compound selector as descendant", () => {
		registerCSSByName("test", ".parent > .child { color: red }")
		const css = getScopedStyles()
		expect(css).toContain('[data-c="test"] .parent > .child{color:red}')
	})
})

describe("CSS scoping — scopeBlock delegates to scopeCSS", () => {
	it("@media with & in property value does not corrupt", () => {
		registerCSSByName("test", '@media screen { content: "A & B" }')
		const css = getScopedStyles()
		expect(css).toContain("A & B")
		expect(css).not.toContain('[data-c="test"]&')
	})

	it("@media with & rule is scoped correctly", () => {
		registerCSSByName("test", "@media screen { &:hover { color: red } }")
		const css = getScopedStyles()
		expect(css).toContain('[data-c="test"]:hover')
		expect(css).toContain("color:red")
	})

	it("@media with named selector is preserved", () => {
		registerCSSByName("test", "@media screen { .inner { color: blue } }")
		const css = getScopedStyles()
		expect(css).toContain('[data-c="test"] .inner')
		expect(css).toContain("color:blue")
	})
})

describe("state selector value escaping", () => {
	it("escapes double quotes in state values", () => {
		styles("esc", {
			css: (s) => `${s.label('he"llo')} { color: red }`,
			state: { label: "test" },
		})
		const css = getScopedStyles()
		expect(css).toContain('data-label="he\\"llo"')
		expect(css).toContain("color:red")
	})

	it("escapes backslashes in state values", () => {
		styles("esc2", {
			css: (s) => `${s.path("a\\b")} { color: blue }`,
			state: { path: "test" },
		})
		const css = getScopedStyles()
		expect(css).toContain('data-path="a\\\\b"')
	})
})

describe("findMatchingBrace — url() handling", () => {
	it("unquoted url() with braces does not break brace matching", () => {
		registerCSSByName(
			"test",
			".icon { background: url(data:image/svg+xml,%3Csvg%7B%7D%3E%3C/svg%3E); color: red }",
		)
		const css = getScopedStyles()
		expect(css).toContain("color:red")
		expect(css).toContain("url(data:image/svg+xml,%3Csvg%7B%7D%3E%3C/svg%3E)")
	})

	it("quoted url() with braces still works", () => {
		registerCSSByName("test", '.icon { background: url("data:{test}"); color: green }')
		const css = getScopedStyles()
		expect(css).toContain("color:green")
		expect(css).toContain('url("data:{test}")')
	})

	it("url() without braces works normally", () => {
		registerCSSByName("test", ".icon { background: url(/img.png); color: blue }")
		const css = getScopedStyles()
		expect(css).toContain("color:blue")
		expect(css).toContain("url(/img.png)")
	})
})

describe("registerCSS", () => {
	it("returns hash string", () => {
		const hash = registerCSS("padding: 1rem")
		expect(typeof hash).toBe("string")
		expect(hash.length).toBeGreaterThan(0)
	})

	it("same CSS returns same hash", () => {
		const a = registerCSS("color: red")
		const b = registerCSS("color: red")
		expect(a).toBe(b)
	})

	it("different CSS returns different hash", () => {
		const a = registerCSS("color: red")
		const b = registerCSS("color: blue")
		expect(a).not.toBe(b)
	})
})

describe("SSR", () => {
	it("getScopedStyles returns all rules", () => {
		registerCSSByName("a", "color: red")
		registerCSSByName("b", "color: blue")
		const css = getScopedStyles()
		expect(css).toContain("color:red")
		expect(css).toContain("color:blue")
	})

	it("clearScopedStyles resets registry", () => {
		registerCSSByName("a", "color: red")
		clearScopedStyles()
		expect(getScopedStyles()).toBe("")
	})
})

describe("CSS name injection protection", () => {
	it("escapes double quotes in name", () => {
		registerCSSByName('evil"x', "color: red")
		const css = getScopedStyles()
		expect(css).toContain('[data-c="evil\\"x"]')
	})

	it("escapes quote+bracket in name", () => {
		registerCSSByName('evil"]', "color: red")
		const css = getScopedStyles()
		/* escaped: evil\"] → selector [data-c="evil\"]"] is valid CSS */
		expect(css).toContain('evil\\"')
		expect(css).toContain("color:red")
	})

	it("escapes backslashes in name", () => {
		registerCSSByName("a\\b", "color: red")
		const css = getScopedStyles()
		expect(css).toContain('[data-c="a\\\\b"]')
	})

	it("normal names pass through unescaped", () => {
		registerCSSByName("my-component", "color: red")
		const css = getScopedStyles()
		expect(css).toContain('[data-c="my-component"]')
	})
})

describe("hashString collision resistance", () => {
	it("10,000 unique strings produce all unique hashes", () => {
		const hashes = new Set<string>()
		for (let i = 0; i < 10_000; i++) {
			const hash = registerCSS(`unique-content-${i}-${String.fromCharCode(65 + (i % 26))}`)
			hashes.add(hash)
		}
		expect(hashes.size).toBe(10_000)
	})

	it("similar short strings produce distinct hashes", () => {
		const pairs = [
			["ab", "ba"],
			["aa", "aA"],
			["0", "1"],
			["color: red", "color: reds"],
		]
		for (const [a, b] of pairs) {
			const ha = registerCSS(a)
			const hb = registerCSS(b)
			expect(ha).not.toBe(hb)
		}
	})
})

describe("var accessor error on missing key", () => {
	it("throws on unknown var key with helpful message", () => {
		expect(() => {
			styles("bad-var", {
				css: (_s, v) => `color: ${(v as Record<string, string>).missing}`,
				vars: { color: "red" },
			})
		}).toThrow('unknown var key "missing"')
	})

	it("includes available keys in error message", () => {
		expect(() => {
			styles("bad-var2", {
				css: (_s, v) => `color: ${(v as Record<string, string>).oops}`,
				vars: { alpha: "1", beta: "2" },
			})
		}).toThrow("alpha, beta")
	})

	it("valid var keys still work", () => {
		const result = styles("ok-var", {
			css: (_s, v) => `color: ${v.color}`,
			vars: { color: "red" },
		})
		const css = getScopedStyles()
		expect(css).toContain("var(--_0)")
		expect(result.style?.["--_0"]).toBe("red")
	})
})

describe("client-side DOM injection", () => {
	function getSheetCSS(): string {
		const styleEl = document.getElementById("flare-runtime") as HTMLStyleElement | null
		if (!styleEl?.sheet) return styleEl?.textContent ?? ""
		return Array.from(styleEl.sheet.cssRules).map((r) => r.cssText).join("")
	}

	it("registerCSSByName injects scoped CSS into DOM style element", () => {
		enableDomInjection()
		registerCSSByName("client-test", "color: red")
		const styleEl = document.getElementById("flare-runtime")
		expect(styleEl).not.toBeNull()
		const css = getSheetCSS()
		expect(css).toContain("color")
		expect(css).toContain("client-test")
	})

	it("styles() injects scoped CSS into DOM on client", () => {
		enableDomInjection()
		styles("dom-box", "padding: 1rem")
		const styleEl = document.getElementById("flare-runtime")
		expect(styleEl).not.toBeNull()
		const css = getSheetCSS()
		expect(css).toContain("padding")
	})

	it("clearScopedStyles clears DOM style element", () => {
		enableDomInjection()
		registerCSSByName("clear-test", "color: blue")
		clearScopedStyles()
		const styleEl = document.getElementById("flare-runtime")
		/* Either element is removed/empty or doesn't exist */
		expect(styleEl?.textContent ?? "").toBe("")
	})

	it("duplicate registration does not inject twice", () => {
		enableDomInjection()
		registerCSSByName("dedup", "margin: 0")
		registerCSSByName("dedup", "margin: 0")
		const css = getSheetCSS()
		const count = css.split("dedup").length - 1
		expect(count).toBe(1)
	})
})

describe("styles (combo scenarios)", () => {
	it("tw + css + vars + state all together", () => {
		const result = styles("combo", {
			css: (s, v) => `color: ${v.color}; ${s.active(true)} { font-weight: bold; }`,
			state: { active: true },
			tw: "display: flex; gap: 1rem",
			vars: { color: "red" },
		})
		expect(result["data-c"]).toBe("combo")
		expect(result["data-active"]).toBe("true")
		expect(result.style?.["--_0"]).toBe("red")

		const css = getScopedStyles()
		expect(css).toContain("display:flex")
		expect(css).toContain("var(--_0)")
		expect(css).toContain('[data-active="true"]')
	})

	it("outerCss hashes name and appends outer CSS", () => {
		const result = styles("outer", {
			css: "padding: 1rem",
			outerCss: ".parent > & { margin: 0 }",
		})
		expect(result["data-c"]).toContain("outer-")
		const css = getScopedStyles()
		expect(css).toContain("padding:1rem")
		expect(css).toContain("margin:0")
	})

	it("style + vars merge order: vars first, then style overrides", () => {
		const result = styles("merge-order", {
			style: { "--_0": "override" },
			vars: { alpha: "original" },
		})
		/* style overrides vars because of spread order: { ...varStyles, ...config.style } */
		expect(result.style?.["--_0"]).toBe("override")
	})
})

describe("scopeCSS: declarations before selector rules", () => {
	it("declarations before a selector rule are scoped separately", () => {
		registerCSSByName("test", "color: red; .title { font-weight: bold }")
		const css = getScopedStyles()
		expect(css).toContain('[data-c="test"]{color:red}')
		expect(css).toContain('[data-c="test"] .title{font-weight:bold}')
	})

	it("declarations then & rule are scoped separately", () => {
		registerCSSByName("test", "padding: 1rem; &:hover { color: blue }")
		const css = getScopedStyles()
		expect(css).toContain('[data-c="test"]{padding:1rem}')
		expect(css).toContain('[data-c="test"]:hover{color:blue}')
	})

	it("declarations then @media are scoped separately", () => {
		registerCSSByName("test", "color: red; @media (min-width: 768px) { padding: 2rem }")
		const css = getScopedStyles()
		expect(css).toContain('[data-c="test"]{color:red}')
		expect(css).toContain("@media (min-width: 768px)")
		expect(css).toContain("padding:2rem")
	})
})
