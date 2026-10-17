import { expect, it, vi } from "vitest"
import { fromWire } from "../../shared/protocol/value.ts"
import { stateScript } from "../render/state.ts"
import { fromSentinel, newSentinel, toSentinel } from "./nonce.ts"

const state = (nonce: string, data: unknown = { text: "abc" }): string =>
	stateScript({
		matches: [{ id: "p", params: {}, search: {}, data, preloader: undefined, head: undefined, error: undefined }],
		nonce,
		build: "dev",
		at: 0,
	})

// One entry's sentinel, as a write makes it.
const S = newSentinel()

it("attribute", () => {
	expect(toSentinel('<script nonce="abc">a()</script>', "abc", S)).toBe(`<script nonce="${S}">a()</script>`)
})

it("quotes", () => {
	expect(toSentinel("<style nonce='abc'>p{}</style>", "abc", S)).toBe(`<style nonce='${S}'>p{}</style>`)
})

// Only nonce attributes and the state field change. Text that equals the nonce is someone's content.
it("text", () => {
	expect(toSentinel("<p>abc</p>", "abc", S)).toBe("<p>abc</p>")
	// Text, or another attribute's value, that spells a nonce attribute is not one: only a tag's own `nonce` changes, on
	// a write, on a hit, and when a string CSP strips it (BUGS.md 332).
	const page = `<pre> nonce="abc"</pre><p title=' nonce="abc"' nonce="abc">x</p>`
	const stored = toSentinel(page, "abc", S)
	expect(stored).toBe(`<pre> nonce="abc"</pre><p title=' nonce="abc"' nonce="${S}">x</p>`)
	expect(fromSentinel(stored, S, "")).toBe(`<pre> nonce="abc"</pre><p title=' nonce="abc"'>x</p>`)
	expect(fromSentinel(stored, S, "a b")).toBe(`<pre> nonce="abc"</pre><p title=' nonce="abc"' nonce="a b">x</p>`)
})

it("other attr", () => {
	expect(toSentinel('<p id="abc" data-nonce="abc">x</p>', "abc", S)).toBe('<p id="abc" data-nonce="abc">x</p>')
	// A nonce attribute holding another value is left alone, and so is one with no value or a bare one.
	expect(toSentinel('<script nonce="zzz"></script>', "abc", S)).toBe('<script nonce="zzz"></script>')
	expect(toSentinel("<script nonce></script><style nonce=abc></style>", "abc", S)).toBe(
		"<script nonce></script><style nonce=abc></style>",
	)
})

// The state's own `nonce` field changes. Loader data that happens to hold the nonce does not.
it("state field", () => {
	const stored = toSentinel(state("abc", { nonce: "abc" }), "abc", S)
	expect(stored).toBe(state(S, { nonce: "abc" }))
	const payload = stored.slice(stored.indexOf("self.flare=") + 11, stored.lastIndexOf("</script>"))
	expect(fromWire(JSON.parse(payload).matches[0].data)).toEqual({ nonce: "abc" })
})

// Loader data holding a closing script tag and a new script stays inert text through the write and a hit: the state is
// written back with the inline-script escape both times, so the replayed page opens no script of its own
// (plan 21 7.3).
it("escaped state", () => {
	const hostile = "</script><script>alert(1)</script><!--"
	const body = `<body>${state("abc", { text: hostile })}</body>`
	expect(body).not.toContain("<script>alert")
	const stored = toSentinel(body, "abc", S)
	const hit = fromSentinel(stored, S, "def")
	for (const html of [stored, hit]) {
		expect(html).not.toContain("<script>alert")
		expect(html).not.toContain("<!--")
		expect(html.match(/<\/script>/g)).toHaveLength(1)
	}
	expect(hit).toBe(`<body>${state("def", { text: hostile })}</body>`)
})

it("round trip", () => {
	const body = `<html><head><style nonce="abc"></style></head><body>abc${state("abc")}</body></html>`
	const stored = toSentinel(body, "abc", S)
	expect(stored).not.toContain('nonce="abc"')
	expect(fromSentinel(stored, S, "def")).toBe(
		`<html><head><style nonce="def"></style></head><body>abc${state("def")}</body></html>`,
	)
	// Only the sentinel is rewritten. Another nonce value stays.
	expect(fromSentinel('<script nonce="zzz"></script>', S, "def")).toBe('<script nonce="zzz"></script>')
})

// A hit whose policy has no nonce, a string or `false` CSP, sends no nonce attribute and an empty state field (B68).
it("strip", () => {
	const stored = toSentinel(`<style nonce="abc"></style><p>x</p>${state("abc")}`, "abc", S)
	expect(fromSentinel(stored, S, "")).toBe(`<style></style><p>x</p>${state("")}`)
	expect(fromSentinel("<p>no state</p>", S, "def")).toBe("<p>no state</p>")
})

// A constant sentinel would let stored content carry it. Each write makes its own.
it("per entry", () => {
	const one = newSentinel()
	const two = newSentinel()
	expect(one).not.toBe(two)
	for (const sentinel of [one, two]) expect(sentinel).toMatch(/^__FLARE_NONCE_[0-9a-f]{32}$/)
})

// Stored markup from loader data cannot be granted the hit's nonce: only the entry's own sentinel becomes it.
it("planted sentinel", () => {
	const planted = `<script nonce="__FLARE_NONCE__">evil()</script><script nonce="${newSentinel()}">evil()</script>`
	const stored = toSentinel(`${planted}<script nonce="abc">ok()</script>`, "abc", S)
	expect(fromSentinel(stored, S, "def")).toBe(`${planted}<script nonce="def">ok()</script>`)
	// The state field is rewritten only when it holds the entry's sentinel.
	expect(fromSentinel(state("__FLARE_NONCE__"), S, "def")).toBe(state("__FLARE_NONCE__"))
})

// A hit is one pass for the server's own hex nonce: the sentinel stands only where the write put it, so it is written
// over without a pattern walk or a parse of the state, and the page is the slow path's to the byte (plan 21 15.2).
it("one pass", () => {
	const nonce = "0123456789abcdef0123456789abcdef"
	const stored = toSentinel(`<style nonce="abc"></style>\n<script\tnonce='abc'>x()</script>${state("abc")}`, "abc", S)
	const parse = vi.spyOn(JSON, "parse")
	const replace = vi.spyOn(String.prototype, "replaceAll")
	const hit = fromSentinel(stored, S, nonce)
	expect(parse).not.toHaveBeenCalled()
	expect(replace).toHaveBeenCalledOnce()
	parse.mockRestore()
	replace.mockRestore()
	expect(hit).toBe(`<style nonce="${nonce}"></style>\n<script\tnonce='${nonce}'>x()</script>${state(nonce)}`)
	// A nonce that would need escaping takes the slow path, which escapes it.
	expect(fromSentinel(stored, S, 'a"b')).toContain('nonce="a&quot;b"')
	// The slow path leaves another nonce value and a state field that is not the sentinel as written.
	const other = `<script nonce="zzz"></script>${state("other")}`
	expect(fromSentinel(other, S, 'a"b')).toBe(other)
})
