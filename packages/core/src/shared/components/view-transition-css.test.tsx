import { createComponent, Errored, flush } from "solid-js"
import { render } from "@solidjs/web"
import { afterEach, expect, it } from "vitest"
import { ViewTransitionCSS } from "./view-transition-css.tsx"

type FlareScope = typeof globalThis & { flare?: { nonce: string } }

afterEach(() => {
	delete (globalThis as FlareScope).flare
})

function styleOf(props: { duration?: number }, requestNonce = "n"): HTMLStyleElement {
	;(globalThis as FlareScope).flare = { nonce: requestNonce }
	const host = document.createElement("div")
	render(() => createComponent(ViewTransitionCSS, props), host)
	flush()
	const style = host.querySelector("style")
	if (style === null) throw new Error("no style")
	return style
}

// 150 ms by default, the user's decision of 2026-10-15 (B125).
it("default duration", () => {
	const style = styleOf({})
	expect(style.textContent).toBe(
		"@view-transition{navigation:auto}::view-transition{pointer-events:none}::view-transition-group(flare-content){animation:none}::view-transition-old(*),::view-transition-new(*){animation-duration:150ms}@media (prefers-reduced-motion:reduce){::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){animation:none}}",
	)
	expect(style.getAttribute("nonce")).toBe("n")
	expect(styleOf({}, "").hasAttribute("nonce")).toBe(false)
})

it("custom duration", () => {
	expect(styleOf({ duration: 300 }).textContent).toContain("animation-duration:300ms")
})

// What a boundary around the rule shows, as an app's boundary would catch its throw. A throw no boundary catches stays
// queued in the render and is reported again on Bun, so the case gives it one.
function caught(duration: number): string {
	;(globalThis as FlareScope).flare = { nonce: "n" }
	const host = document.createElement("div")
	const dispose = render(
		() =>
			createComponent(Errored, {
				fallback: (error: () => unknown) => String(Reflect.get(Object(error()), "message")),
				get children() {
					return createComponent(ViewTransitionCSS, { duration })
				},
			}),
		host,
	)
	flush()
	const text = String(host.textContent)
	dispose()
	return text
}

// A duration that is not a finite number at least 0 would write CSS the browser drops, so the rule would set no duration
// at all: it throws, naming the prop (dx/navigate.md, BUGS.md 324). A fraction is valid CSS.
it("duration checked", () => {
	for (const duration of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
		expect(caught(duration)).toBe("ViewTransitionCSS duration is a finite number of milliseconds, at least 0")
	}
	expect(styleOf({ duration: 1.5 }).textContent).toContain("animation-duration:1.5ms")
	expect(styleOf({ duration: 0 }).textContent).toContain("animation-duration:0ms")
})

it("reduced motion", () => {
	expect(styleOf({}).textContent).toMatch(
		/@media \(prefers-reduced-motion:reduce\)\{::view-transition-group\(\*\),::view-transition-old\(\*\),::view-transition-new\(\*\)\{animation:none\}\}$/,
	)
})

// The document transition keeps its crossfade: no rule hides the old root snapshot (the user's call of 2026-10-15,
// withdrawing B125's hide). An app that meets Chromium 573693508's white capture adds
// `::view-transition-old(root){display:none}` itself (dx/navigate.md).
it("old root kept", () => {
	expect(styleOf({}).textContent).not.toContain("::view-transition-old(root)")
})

// The transition's overlay passes pointer events through to the live page, so hover, the pointer cursor, and clicks keep
// working on what does not change while a document-scoped transition runs (BUGS.md 119.16, B126).
it("pointer passthrough", () => {
	expect(styleOf({}).textContent).toContain("::view-transition{pointer-events:none}")
})

// The content group does not animate: an element's image is drawn at its old box, which moves when the navigation
// moves the window, so animated it slides (31 px in Chrome, -696 to 132 px in Safari, from a page scrolled to its bottom); still, it
// crossfades in place. The rule is outside the reduced-motion query, so it holds for every user (B129).
it("content group still", () => {
	const text = styleOf({}).textContent ?? ""
	const rule = "::view-transition-group(flare-content){animation:none}"
	expect(text).toContain(rule)
	expect(text.indexOf(rule)).toBeLessThan(text.indexOf("@media"))
})
