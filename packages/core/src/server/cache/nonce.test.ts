import { expect, it } from "vitest"
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
})

it("other attr", () => {
	expect(toSentinel('<p id="abc" data-nonce="abc">x</p>', "abc", S)).toBe('<p id="abc" data-nonce="abc">x</p>')
	// A nonce attribute holding another value is left alone.
	expect(toSentinel('<script nonce="zzz"></script>', "abc", S)).toBe('<script nonce="zzz"></script>')
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
