import { createComponent, createMemo, Errored } from "solid-js"
import { Dynamic, renderToString } from "@solidjs/web"
import { expect, it } from "vitest"
import { SafeErrored } from "./safe-errored.ts"

const EVIL = "<i>x</i>"
const SAFE = "&lt;i>x&lt;/i>"

// The markup without Solid's hydration keys and markers.
function html(children: () => unknown, boundary: typeof Errored | typeof SafeErrored = SafeErrored): string {
	return renderToString(() =>
		createComponent(Dynamic, {
			component: "body",
			get children() {
				return createComponent(boundary, {
					fallback: "failed",
					get children() {
						return children() as never
					},
				})
			},
		}),
	)
		.replaceAll(/ _hk=\w+/g, "")
		.replaceAll(/<!--.*?-->/g, "")
}

// Solid's own SSR Errored writes a string child raw; SafeErrored writes it as text (BUGS.md 141).
it("raw in errored", () => {
	expect(html(() => EVIL, Errored)).toBe(`<body>${EVIL}</body>`)
	expect(html(() => EVIL)).toBe(`<body>${SAFE}</body>`)
})

// An array at any depth, a function, and a memo resolve to escaped text; an element passes as markup, its own text
// escaped once.
it("shapes", () => {
	expect(html(() => [EVIL, ["!", [EVIL]]])).toBe(`<body>${SAFE}!${SAFE}</body>`)
	expect(html(() => () => EVIL)).toBe(`<body>${SAFE}</body>`)
	expect(html(() => createMemo(() => EVIL))).toBe(`<body>${SAFE}</body>`)
	expect(html(() => createComponent(Dynamic, { component: "b", children: "<i>" }))).toBe("<body><b>&lt;i></b></body>")
})

// A throw renders the fallback, as Errored does, and Solid serializes the error for the client.
it("fallback", () => {
	expect(
		html(() => {
			throw new Error("x")
		}),
	).toMatch(/^<body>failed<\/body><script>/)
})
