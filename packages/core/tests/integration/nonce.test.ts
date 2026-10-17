import { createComponent, createMemo, Loading, type Element } from "solid-js"
import { Dynamic } from "@solidjs/web"
import { expect, it, vi } from "vitest"
import type { FlareStore } from "../../src/server/cache/contract.ts"
import { createMemoryStore } from "../../src/server/cache/memory.ts"
import type { StoredPage } from "../../src/server/cache/write.ts"
import { createServer } from "../../src/server/lifecycle/create.ts"
import type { SecurityConfig } from "../../src/server/security/apply.ts"
import { ViewTransitionCSS } from "../../src/shared/components/index.ts"
import { nonce } from "../../src/shared/csp/nonce.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"
import { createRouter, type Router } from "../../src/shared/router/create-router.ts"
import type { Head } from "../../src/server/render/head.ts"
import { DirectionScript } from "../../src/features/direction/shared/index.ts"
import { createFont, FontCSS } from "../../src/features/fonts/shared/index.ts"
import { LocaleProvider, LocaleScript } from "../../src/features/i18n/shared/index.ts"
import { ThemeScript } from "../../src/features/theme/shared/index.ts"

// One nonce per request, through the real createServer and the real modules (B96): the header, every tag Flare writes,
// and `nonce()` in a render agree, a stored page holds its entry's sentinel, and a hit carries its own nonce. The
// critical style and the swap script exist only in a server build, so a built app pins theirs (`plugin.test.ts`
// `critical and swap nonce`).

const head: Head = {
	jsonLd: [{ "@type": "Thing" }],
	custom: {
		scripts: [{ children: "var x = 1" }],
		styles: [{ children: "a{}" }],
	},
}

function printed(): string {
	return `NONCE[${nonce()}]`
}

function Grandchild(): Element {
	return printed()
}

function Child(): Element {
	return createComponent(Grandchild, {})
}

function Page(): Element {
	return createComponent(Child, {})
}

type Render = () => Element

// Solid writes the head into the document's head element, so the root renders a full document.
function documentOf(children: Element): Element {
	return createComponent(Dynamic, {
		component: "html",
		get children() {
			return [
				createComponent(Dynamic, { component: "head" }),
				createComponent(Dynamic, { component: "body", children }),
			]
		},
	})
}

function router(render: Render): Router {
	const page = createPage("_root_/")
		.loader(() => ({ title: "Home" }))
		.head(() => head)
		.render(render)
	return createRouter({
		layouts: { _root_: createRootLayout("_root_").render((props) => documentOf(props.children)) },
		routeTree: [{ id: "_root_/", path: "/", module: page }],
	})
}

function server(render: Render, security?: SecurityConfig | ((ctx: { nonce: string }) => SecurityConfig)) {
	return createServer({ router: router(render), security })
}

function headerNonce(headers: Headers): string {
	const policy = headers.get("content-security-policy")
	if (policy === null) throw new Error("csp")
	const matched = /'nonce-([^']+)'/.exec(policy)
	const value = matched?.[1]
	if (value === undefined) throw new Error("csp")
	return value
}

function capture(body: string, pattern: RegExp): string {
	const value = pattern.exec(body)?.[1]
	if (value === undefined) throw new Error("nonce")
	return value
}

function tagNonces(body: string): { script: string; json: string; style: string } {
	return {
		script: capture(body, /<script nonce="([^"]+)"[^>]*>var x = 1<\/script>/),
		json: capture(body, /<script type="application\/ld\+json" nonce="([^"]+)"[^>]*>/),
		style: capture(body, /<style nonce="([^"]+)"[^>]*>a\{\}<\/style>/),
	}
}

async function document(
	render: Render,
	security?: SecurityConfig | ((ctx: { nonce: string }) => SecurityConfig),
): Promise<Response> {
	return server(render, security).fetch(new Request("http://localhost/"))
}

it("same value", async () => {
	const response = await document(() => printed())
	const body = await response.text()
	const value = headerNonce(response.headers)
	const tags = tagNonces(body)
	expect(tags.script).toBe(value)
	expect(tags.json).toBe(value)
	expect(tags.style).toBe(value)
	expect(body).toContain(`NONCE[${value}]`)
})

// A slot whose value comes after the shell, then prints the nonce.
function late(): Element {
	return createComponent(Loading, {
		fallback: "wait",
		get children() {
			const ready = createMemo(async () => new Promise<string>((resolve) => setTimeout(() => resolve("late"), 10)))
			return [() => `${ready()} ${printed()}`]
		},
	})
}

// A component that renders after an async boundary, behind `<Loading>`, reads the request's nonce too: its fragment
// streams after the shell, outside the shell's synchronous pass (plan 21 3.13).
it("after loading", async () => {
	const response = await document(late)
	const body = await response.text()
	expect(body).toContain(`late NONCE[${headerNonce(response.headers)}]`)
})

it("nested", async () => {
	const response = await document(() => Page())
	const body = await response.text()
	const value = headerNonce(response.headers)
	const tags = tagNonces(body)
	expect(tags.script).toBe(value)
	expect(tags.json).toBe(value)
	expect(tags.style).toBe(value)
	expect(body).toContain(`NONCE[${value}]`)
})

it("second request", async () => {
	const first = await document(() => printed())
	const second = await document(() => printed())
	const firstBody = await first.text()
	const secondBody = await second.text()
	const firstNonce = headerNonce(first.headers)
	const secondNonce = headerNonce(second.headers)
	const firstTags = tagNonces(firstBody)
	const secondTags = tagNonces(secondBody)
	expect(firstNonce).not.toBe(secondNonce)
	expect(firstTags.script).toBe(firstNonce)
	expect(firstTags.json).toBe(firstNonce)
	expect(firstTags.style).toBe(firstNonce)
	expect(firstBody).toContain(`NONCE[${firstNonce}]`)
	expect(secondTags.script).toBe(secondNonce)
	expect(secondTags.json).toBe(secondNonce)
	expect(secondTags.style).toBe(secondNonce)
	expect(secondBody).toContain(`NONCE[${secondNonce}]`)
})

it("string omits", async () => {
	const response = await document(
		() => printed(),
		() => ({ "Content-Security-Policy": "default-src 'none'" }),
	)
	const body = await response.text()
	expect(response.headers.get("content-security-policy")).toBe("default-src 'none'")
	expect(body).not.toContain("nonce=")
	expect(body).toContain("NONCE[]")
})

it("false omits", async () => {
	const response = await document(
		() => printed(),
		() => ({ "Content-Security-Policy": false }),
	)
	const body = await response.text()
	expect(response.headers.get("content-security-policy")).toBeNull()
	expect(body).not.toContain("nonce=")
	expect(body).toContain("NONCE[]")
})

it("view transition", async () => {
	const response = await document(() => createComponent(ViewTransitionCSS, {}))
	const body = await response.text()
	expect(capture(body, /<style[^>]*nonce="([^"]+)"[^>]*>@view-transition/)).toBe(headerNonce(response.headers))
})

// The page stored for every visitor, in a real memory store.
function storing(render: Render): { app: ReturnType<typeof createServer>; store: FlareStore } {
	const store = createMemoryStore()
	const page = createPage("_root_/")
		.cache({ isr: true })
		.head(() => head)
		.render(render)
	const routes = createRouter({
		layouts: { _root_: createRootLayout("_root_").render((props) => documentOf(props.children)) },
		routeTree: [{ id: "_root_/", path: "/", module: page }],
	})
	return { app: createServer({ router: routes, site: "https://example.com", store }), store }
}

// The entry the home page's write left, read from the store under the key the server gives that page.
async function storedPage(stored: { app: ReturnType<typeof createServer>; store: FlareStore }): Promise<StoredPage> {
	const key = stored.app.cache.key({ to: "_root_/" } as never)
	await vi.waitFor(async () => expect(await stored.store.get(key)).not.toBeNull())
	return (await stored.store.get(key))?.data as StoredPage
}

// The stored bytes hold the entry's sentinel in every nonce attribute and in the state field, never the nonce of the
// request that rendered them.
it("stored sentinel", async () => {
	const kept = storing(() => "page")
	const response = await kept.app.fetch(new Request("http://localhost/"))
	const first = headerNonce(response.headers)
	const stored = await storedPage(kept)
	expect(tagNonces(stored.html)).toEqual({ script: stored.sentinel, json: stored.sentinel, style: stored.sentinel })
	expect(stored.html).toContain(`"nonce":"${stored.sentinel}"`)
	expect(stored.html).not.toContain(`nonce="${first}"`)
	expect(stored.html).not.toContain(`"nonce":"${first}"`)
})

// Text that equals the nonce is content. It is stored as it was rendered.
it("text kept", async () => {
	const kept = storing(() => printed())
	const response = await kept.app.fetch(new Request("http://localhost/"))
	const first = headerNonce(response.headers)
	expect((await storedPage(kept)).html).toContain(`NONCE[${first}]`)
})

// A hit's nonce attributes and `self.flare.nonce` equal that hit's CSP nonce, never the first request's.
it("hit matches", async () => {
	const kept = storing(() => "page")
	const first = await kept.app.fetch(new Request("http://localhost/"))
	const firstNonce = headerNonce(first.headers)
	await storedPage(kept)
	const hit = await kept.app.fetch(new Request("http://localhost/"))
	expect(hit.headers.get("flare-cache")).toBe("hit")
	const nonce = headerNonce(hit.headers)
	const body = await hit.text()
	expect(nonce).not.toBe(firstNonce)
	expect(tagNonces(body)).toEqual({ script: nonce, json: nonce, style: nonce })
	expect(body).toContain(`"nonce":"${nonce}"`)
	expect(body).not.toContain(firstNonce)
})

// Every feature's inline tag carries the CSP header's nonce: the theme, direction, and locale scripts, and the font CSS.
it("features", async () => {
	const locale = { locales: ["en", "hr"], defaultLocale: "en" }
	const font = createFont({ family: "Brand", src: "/fonts/brand.woff2", category: "serif" })
	const page = createPage("_root_/").render(() =>
		createComponent(LocaleProvider, {
			config: locale,
			initial: "hr",
			get children() {
				return [
					createComponent(ThemeScript, {}),
					createComponent(DirectionScript, { locale: "hr" }),
					createComponent(LocaleScript, {}),
					createComponent(FontCSS, { font }),
				]
			},
		}),
	)
	const featured = createServer({
		router: createRouter({
			layouts: { _root_: createRootLayout("_root_").render((props) => documentOf(props.children)) },
			routeTree: [{ id: "_root_/", path: "/", module: page }],
			theme: {},
			direction: {},
			locale,
		}),
	})
	const response = await featured.fetch(new Request("http://localhost/"))
	const body = await response.text()
	const expected = headerNonce(response.headers)
	expect(capture(body, /<script nonce="([^"]+)">[^<]*flare\.theme/)).toBe(expected)
	expect(capture(body, /<script nonce="([^"]+)">[^<]*flare\.dir/)).toBe(expected)
	expect(capture(body, /<script nonce="([^"]+)">[^<]*\.lang=/)).toBe(expected)
	expect(capture(body, /<style[^>]*nonce="([^"]+)"[^>]*>@font-face/)).toBe(expected)
})
