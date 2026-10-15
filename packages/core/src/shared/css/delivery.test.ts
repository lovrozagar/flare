import { createRequire } from "node:module"
import { expect, it } from "vitest"
import { stylesheetMarkup, SWAP_SCRIPT, type DeliveryTag } from "./delivery.ts"

const HREF = "/assets/app.css"

// jsdom ships no types; the one constructor this file uses.
type Dom = new (html: string, options: { runScripts: "dangerously"; url: string }) => { window: Window }
const { JSDOM } = createRequire(import.meta.url)("jsdom") as { JSDOM: Dom }

it("prod markup", () => {
	expect(stylesheetMarkup(HREF, "n")).toEqual([
		{ tag: "link", props: { id: "flare-stylesheet", rel: "preload", as: "style", href: HREF } },
		{ tag: "noscript", props: {}, children: { tag: "link", props: { rel: "stylesheet", href: HREF } } },
		{ tag: "script", props: { nonce: "n" }, children: SWAP_SCRIPT },
	])
})

// The script fetches nothing itself, and its text is constant, so a CSP hash can allow it.
it("script constant", () => {
	expect(SWAP_SCRIPT).not.toMatch(/fetch|XMLHttpRequest|import/)
	expect(SWAP_SCRIPT).not.toContain(HREF)
})

function html(tag: DeliveryTag): string {
	const attributes = Object.entries(tag.props)
		.map(([name, value]) => ` ${name}="${value}"`)
		.join("")
	const inner = tag.children === undefined ? "" : typeof tag.children === "string" ? tag.children : html(tag.children)
	return tag.tag === "link" ? `<link${attributes}>` : `<${tag.tag}${attributes}>${inner}</${tag.tag}>`
}

// Run as the parser runs it, the script leaves the preload alone and adds the stylesheet right after itself, with the
// preload's href. Flipping the preload's rel made WebKit cancel the preload in flight, and under load the loads after
// that cancel failed with an internal error (BUGS.md 87).
it("swap keeps the preload", () => {
	const markup = stylesheetMarkup(HREF, "n").map(html).join("")
	const { document } = new JSDOM(`<!doctype html><html><head>${markup}</head><body></body></html>`, {
		runScripts: "dangerously",
		url: "https://example.com/",
	}).window
	expect([...document.head.children].map((node) => [node.tagName, node.getAttribute("rel")])).toEqual([
		["LINK", "preload"],
		["NOSCRIPT", null],
		["SCRIPT", null],
		["LINK", "stylesheet"],
	])
	expect(document.head.lastElementChild?.getAttribute("href")).toBe(HREF)
})

it("no inline style", () => {
	const tags = [...stylesheetMarkup(HREF, "n"), ...stylesheetMarkup(HREF, "")]
	expect(tags.map((tag) => tag.tag)).not.toContain("style")
})

// A string or `false` CSP has no nonce, and would block an un-nonced script (B68).
it("no nonce", () => {
	expect(stylesheetMarkup(HREF, "")).toEqual([{ tag: "link", props: { rel: "stylesheet", href: HREF } }])
})
