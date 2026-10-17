import { afterEach, expect, it, vi } from "vitest"
import { criticalCss } from "./critical.ts"
import * as match from "./match.ts"
import * as parse from "./parse.ts"

// Spies on the two collaborators, so `parse once` and `candidates` can count their calls.
vi.mock("./parse.ts", async (original) => {
	const actual = await original<typeof import("./parse.ts")>()
	return { ...actual, parseCss: vi.fn<typeof actual.parseCss>(actual.parseCss) }
})
vi.mock("./match.ts", async (original) => {
	const actual = await original<typeof import("./match.ts")>()
	return { ...actual, matchesSelector: vi.fn<typeof actual.matchesSelector>(actual.matchesSelector) }
})

afterEach(() => {
	vi.mocked(parse.parseCss).mockClear()
	vi.mocked(match.matchesSelector).mockClear()
})

const shell = (body: string): string => `<html><head></head><body>${body}</body></html>`

it("used", () => {
	expect(criticalCss(shell(`<p class="a"></p>`), ".a{color:red}")).toBe(".a{color:red}")
})

it("unused", () => {
	expect(criticalCss(shell(`<p class="a"></p>`), ".a{color:red}.b{color:blue}")).toBe(".a{color:red}")
	// An unused rule loses its declarations though a nested rule that matches stays.
	expect(criticalCss(shell(`<p class="a"></p>`), ".b{color:red;:not(&){top:0}}")).toBe(".b{:not(&){top:0}}")
})

it("media", () => {
	const css = "@media (min-width:1px){.a{color:red}}"
	expect(criticalCss(shell(`<p class="a"></p>`), css)).toBe(css)
	const nested = ".a{color:red;@media (min-width:1px){color:blue}}"
	expect(criticalCss(shell(`<p class="a"></p>`), nested)).toBe(nested)
})

it("media empty", () => {
	expect(criticalCss(shell(`<p class="a"></p>`), "@media (min-width:1px){.b{color:red}}")).toBe("")
	expect(criticalCss(shell(`<p class="a"></p>`), ".b{@media (min-width:1px){color:red}}")).toBe("")
})

it("keyframes", () => {
	const css = "@keyframes spin{to{rotate:1turn}}@keyframes fade{to{opacity:0}}.a{animation:spin 1s linear}"
	expect(criticalCss(shell(`<p class="a"></p>`), css)).toBe(
		"@keyframes spin{to{rotate:1turn}}.a{animation:spin 1s linear}",
	)
	const named = ".b{animation-name:fade,spin}@keyframes fade{to{opacity:0}}"
	expect(criticalCss(shell(`<p class="b"></p>`), named)).toBe(named)
	// Tailwind names the keyframes in a theme variable.
	const themed =
		":root{--animate-spin:spin 1s linear infinite}@keyframes spin{to{rotate:1turn}}.c{animation:var(--animate-spin)}"
	expect(criticalCss(shell(`<p class="c"></p>`), themed)).toBe(themed)
})

it("font", () => {
	const css = `@font-face{font-family:"Ada";src:url(a.woff2)}@font-face{font-family:Bea;src:url(b.woff2)}.a{font-family:Ada,serif}`
	expect(criticalCss(shell(`<p class="a"></p>`), css)).toBe(
		`@font-face{font-family:"Ada";src:url(a.woff2)}.a{font-family:Ada,serif}`,
	)
	const shorthand = `@font-face{font-family:'Bea Sans';src:url(b.woff2)}.b{font:16px/1.5 "Bea Sans",serif}`
	expect(criticalCss(shell(`<p class="b"></p>`), shorthand)).toBe(shorthand)
	const minified = `@font-face{font-family:Cy;src:url(c.woff2)}@font-face{font-family:"Dee Sans";src:url(d.woff2)}.c{font:700 16px/1.5"Dee Sans",serif}`
	expect(criticalCss(shell(`<p class="c"></p>`), minified)).toBe(
		`@font-face{font-family:"Dee Sans";src:url(d.woff2)}.c{font:700 16px/1.5"Dee Sans",serif}`,
	)
	// Tailwind names the family in a theme variable.
	const themed = `:root{--font-sans:"Ada",sans-serif}@font-face{font-family:Ada;src:url(a.woff2)}.d{font-family:var(--font-sans)}`
	expect(criticalCss(shell(`<p class="d"></p>`), themed)).toBe(themed)
})

it("layer", () => {
	expect(criticalCss(shell(`<p class="a"></p>`), "@layer a,b;.b{color:red}")).toBe("@layer a,b;")
	expect(criticalCss(shell(`<p class="a"></p>`), "@layer base{.a{color:red}.b{color:blue}}")).toBe(
		"@layer base{.a{color:red}}",
	)
})

// Only `@keyframes` and `@font-face` are filtered by use. Any other at-rule may shape a kept rule, so it stays.
it("other at-rules", () => {
	const css =
		"@property --x{syntax:'<length>';inherits:false;initial-value:0}@counter-style thumbs{system:cyclic;symbols:x}.b{color:red}"
	expect(criticalCss(shell(`<p class="a"></p>`), css)).toBe(
		"@property --x{syntax:'<length>';inherits:false;initial-value:0}@counter-style thumbs{system:cyclic;symbols:x}",
	)
})

it("order", () => {
	const css = ".c{color:red}.a{color:blue}.b{color:green}"
	expect(criticalCss(shell(`<p class="a b c"></p>`), css)).toBe(css)
})

// A theme or direction script sets its attribute before paint, so a rule that needs it is kept.
it("theme attr", () => {
	const css = `[data-theme="dark"] .a{color:white}`
	expect(criticalCss(shell(`<p class="a"></p>`), css, { themeAttribute: "data-theme" })).toBe(css)
	expect(criticalCss(shell(`<p class="a"></p>`), css)).toBe("")
	const rtl = `[dir="rtl"] .a{margin-right:0}`
	expect(criticalCss(shell(`<p class="a"></p>`), rtl, { directionAttribute: "dir" })).toBe(rtl)
})

it("escape", () => {
	const result = criticalCss(shell(`<p class="a"></p>`), `.a{content:"</style><script>"}`)
	expect(result.toLowerCase()).not.toContain("</style")
	expect(result).toContain(".a{")
})

it("empty", () => {
	expect(criticalCss(shell(""), "")).toBe("")
})

// The preflight's `*` rule matches any shell, so it is inlined when reset is on.
it("reset inlined", () => {
	const css = "@layer reset {*,::after,::before{box-sizing:border-box;margin:0}}.z{color:red}"
	const result = criticalCss("<html><body></body></html>", css)
	expect(result).toContain("*,::after,::before{box-sizing:border-box;margin:0}")
	expect(result).not.toContain(".z")
})

// The sheet is parsed once per process. Each call only matches the shell.
it("parse once", () => {
	const css = ".once{color:red}.twice{color:blue}"
	criticalCss(shell(`<p class="once"></p>`), css)
	criticalCss(shell(`<p class="twice"></p>`), css)
	expect(vi.mocked(parse.parseCss).mock.calls.filter(([sheet]) => sheet === css)).toHaveLength(1)
})

// Rules are indexed by the rightmost compound's class, id, or tag. Only those the shell can reach, plus unkeyed
// rules, are tested against it.
it("candidates", () => {
	const css = [
		...Array.from({ length: 5000 }, (_, index) => `.c${index}{order:${index}}`),
		"*{margin:0}",
		":root{--x:1}",
	].join("")
	const result = criticalCss(shell(`<p class="c1 c20"></p><b class="c300"></b>`), css)
	expect(result).toBe(".c1{order:1}.c20{order:20}.c300{order:300}*{margin:0}:root{--x:1}")
	expect(vi.mocked(match.matchesSelector).mock.calls.length).toBeLessThanOrEqual(5)
	// Nested rules are indexed by their resolved selector, and a rule keyed by id or tag is a candidate too.
	const nested = ".card{color:red;& h2{color:blue}}#hero{top:0}h1{margin:0}"
	expect(criticalCss(shell(`<div class="card"><h2 id="hero">t</h2></div>`), nested)).toBe(
		".card{color:red;& h2{color:blue}}#hero{top:0}",
	)
})

// The selector matches run so far.
function calls(): number {
	return vi.mocked(match.matchesSelector).mock.calls.length
}

// A shell whose two divs hold `text`.
function twoDivs(text: string): string {
	return `<html><body><div class="a">${text}</div><div class="b"><p>${text}</p></div></body></html>`
}

// The rules a shell keeps follow from its elements, their attributes, and their places, never from its text, so a
// second shell of the same structure, a page's next request with other data, matches nothing again and gets the same
// rules; another structure, or another attribute the theme script sets, is matched anew. The 64 latest structures are
// kept (plan 21 15.1).
it("kept by structure", () => {
	const css = ".a{color:red}.b p{margin:0}.c+.d{gap:1px}[data-theme=dark] .a{color:blue}"
	const first = criticalCss(twoDivs("one"), css)
	const before = calls()
	expect(criticalCss(twoDivs("two, with more text"), css)).toBe(first)
	expect(calls()).toBe(before)
	criticalCss(twoDivs("one").replace('class="b"', 'class="b c"'), css)
	expect(calls()).toBeGreaterThan(before)
	const themed = criticalCss(twoDivs("one"), css, { themeAttribute: "data-theme" })
	expect(themed).toContain("color:blue")
	expect(first).not.toContain("color:blue")
	for (let index = 0; index < 64; index++) criticalCss(twoDivs("x").replace('class="a"', `class="a n${index}"`), css)
	const evicted = calls()
	expect(criticalCss(twoDivs("one"), css)).toBe(first)
	expect(calls()).toBeGreaterThan(evicted)
})

const nonced = (nonce: string) =>
	`<html><head><script nonce="${nonce}">1</script><link rel="modulepreload" href="/a.js" nonce="${nonce}"></head><body><div class="a">x</div></body></html>`

// A document's nonce is fresh per request under the default CSP, on its scripts, styles, and preload links, and no
// selector reads its value, so two shells that differ only in their nonces share one kept match (BUGS.md 274).
it("kept across nonces", () => {
	const css = ".a{color:red}script+.a{gap:1px}"
	const first = criticalCss(nonced("8f2a"), css)
	const before = calls()
	expect(criticalCss(nonced("c41d"), css)).toBe(first)
	expect(calls()).toBe(before)
})
