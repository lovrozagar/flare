import { createComponent, createRoot, flush } from "solid-js"
import { render } from "@solidjs/web"
import { afterEach, expect, it, vi } from "vitest"
import { withRequest, type StylesheetPlacement } from "../csp/nonce.ts"
import { Stylesheet } from "./stylesheet.tsx"

type FlareScope = typeof globalThis & { flare?: { nonce: string } }

// The server environment's sheet module. The source module is empty.
const sheet = vi.hoisted(() => ({ href: "/assets/app.css" }))
vi.mock("../css/sheet.ts", () => ({
	builtSheet: "",
	get builtHref() {
		return sheet.href
	},
}))

afterEach(() => {
	vi.unstubAllEnvs()
	sheet.href = "/assets/app.css"
	delete (globalThis as FlareScope).flare
})

// What a client-only render writes for the request nonce `requestNonce`, with `count` Stylesheets side by side.
function rendered(requestNonce = "n", count = 1): HTMLElement {
	;(globalThis as FlareScope).flare = { nonce: requestNonce }
	const host = document.createElement("div")
	disposers.push(render(() => Array.from({ length: count }, () => createComponent(Stylesheet, {})), host))
	flush()
	return host
}

const disposers: (() => void)[] = []

afterEach(() => {
	for (const dispose of disposers.splice(0)) dispose()
})

it("dev", () => {
	vi.stubEnv("DEV", true)
	expect(rendered().innerHTML).toBe("")
	// A dev document writes one style per CSS module its chain imports, keyed as Vite's client keys them (B104).
	const devStyles = [
		{ id: "/src/app.css", css: "a{}" },
		{ id: "/src/page.module.css", css: "b{content:'</style>'}" },
	]
	const host = withRequest({ path: "/", nonce: "n", devStyles }, () => rendered())
	expect(host.innerHTML).toBe(
		'<style data-vite-dev-id="/src/app.css" nonce="n">a{}</style>' +
			'<style data-vite-dev-id="/src/page.module.css" nonce="n">b{content:\'<\\/style>\'}</style>',
	)
	expect(withRequest({ path: "/", nonce: "", devStyles }, () => rendered("")).innerHTML).not.toContain("nonce")
})

it("prod", () => {
	vi.stubEnv("DEV", false)
	expect(rendered().innerHTML).toBe(
		'<link id="flare-stylesheet" rel="preload" as="style" href="/assets/app.css">' +
			'<noscript><link rel="stylesheet" href="/assets/app.css"></noscript>' +
			'<script nonce="n">{const l=document.createElement("link");l.rel="stylesheet";l.href=document.getElementById("flare-stylesheet").getAttribute("href");document.currentScript.after(l)}</script>',
	)
	// A page with no nonce, rendered on its own: the first page's Stylesheet has unmounted.
	for (const dispose of disposers.splice(0)) dispose()
	expect(rendered("").innerHTML).toBe('<link rel="stylesheet" href="/assets/app.css">')
})

// The swap script carries the request nonce, the one the CSP header names. The component does not invent one.
it("nonce", () => {
	vi.stubEnv("DEV", false)
	expect(rendered("r1").querySelector("script")?.getAttribute("nonce")).toBe("r1")
})

it("prod without css", () => {
	vi.stubEnv("DEV", false)
	sheet.href = ""
	expect(rendered().innerHTML).toBe("")
})

// In a document render the component leaves its href to the document, which writes the markup right after the
// critical style (B103), and renders nothing in place.
it("placed", () => {
	vi.stubEnv("DEV", false)
	const stylesheet: StylesheetPlacement = {}
	const host = withRequest({ path: "/", nonce: "n", stylesheet }, () => rendered())
	expect(host.innerHTML).toBe("")
	expect(stylesheet.href).toBe("/assets/app.css")
})

// The page holds one stylesheet: a second `<Stylesheet />` in the same render renders nothing, in a dev document, a
// production document, and a client-only render alike; once the first unmounts, a new one renders again
// (dx/head.md, BUGS.md 481).
it("one per render", () => {
	vi.stubEnv("DEV", true)
	const devStyles = [
		{ id: "/src/app.css", css: "a{}" },
		{ id: "/src/page.module.css", css: "b{}" },
	]
	const dev = withRequest({ path: "/", nonce: "n", devStyles }, () => rendered("n", 2))
	expect(dev.querySelectorAll('[data-vite-dev-id="/src/app.css"]')).toHaveLength(1)
	expect(dev.querySelectorAll('[data-vite-dev-id="/src/page.module.css"]')).toHaveLength(1)
	vi.stubEnv("DEV", false)
	for (const dispose of disposers.splice(0)) dispose()
	const stylesheet: StylesheetPlacement = {}
	expect(withRequest({ path: "/", nonce: "n", stylesheet }, () => rendered("n", 2)).innerHTML).toBe("")
	expect(stylesheet.href).toBe("/assets/app.css")
	for (const dispose of disposers.splice(0)) dispose()
	const alone = rendered("n", 2)
	expect(alone.querySelectorAll("#flare-stylesheet")).toHaveLength(1)
	expect(alone.querySelectorAll("script")).toHaveLength(1)
	expect(rendered("n").querySelectorAll("#flare-stylesheet")).toHaveLength(0)
	for (const dispose of disposers.splice(0)) dispose()
	expect(rendered("n").querySelectorAll("#flare-stylesheet")).toHaveLength(1)
	// A render with no request scope and no document, a bare server render, claims nothing and renders.
	vi.stubGlobal("document", undefined)
	try {
		expect(createRoot((dispose) => [Stylesheet(), dispose()][0])).toBeDefined()
	} finally {
		vi.unstubAllGlobals()
	}
})
