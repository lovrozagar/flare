import { dirname, resolve } from "node:path"
import type { Page } from "@playwright/test"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { appFrom } from "./harness-app.ts"
import { ENGINES, startHarness, type Harness } from "./hydrate.harness.ts"

// dx/head.md's client merge through SSR then hydrate in each engine (B96): what `document.title` reads after client
// navigations, against what a hard load of the same URL gives.

let harness: Harness | undefined

beforeAll(async () => {
	harness = await startHarness(resolve(dirname(expect.getState().testPath ?? ""), "../.."))
})

afterAll(async () => {
	await harness?.close()
})

// A post whose loader throws notFound() for `bad`, a page whose `.head()` throws for `bad`, a titled page, and an
// untitled one. No root or layout sets a title, so a hard load of a failed or untitled page has none.
const APP = appFrom(`
const anchor = (to) => api.solid.createComponent(api.web.Dynamic, { component: "a", href: to, id: "to" + to.replaceAll("/", "-"), children: to })
const links = ["/p/1", "/p/bad", "/q/1", "/q/bad", "/a", "/none"]
const root = api.rootLayout.createRootLayout("_root_").render((props) => api.h("html", "doc", () => [
	api.h("head", "head"),
	api.h("body", "body", () => [...links.map(anchor), api.h("main", "slot", () => props.children)]),
]))
const post = api.page.createPage("_root_/p/[id]")
	.loader(({ params }) => { if (params.id === "bad") throw api.errors.notFound(); return { id: params.id } })
	.head(({ params }) => ({ title: "Post " + params.id }))
	.render(() => api.h("p", "post", () => "post"))
const quiz = api.page.createPage("_root_/q/[id]")
	.head(({ params }) => { if (params.id === "bad") throw new Error("head failed"); return { title: "Q " + params.id } })
	.render(() => api.h("p", "quiz", () => "quiz"))
const titled = api.page.createPage("_root_/a").head(() => ({ title: "A" })).render(() => api.h("p", "titled", () => "a"))
const untitled = api.page.createPage("_root_/none").render(() => api.h("p", "untitled", () => "none"))
const routeTree = [
	{ id: "_root_/p/[id]", path: "/p/[id]", module: post },
	{ id: "_root_/q/[id]", path: "/q/[id]", module: quiz },
	{ id: "_root_/a", path: "/a", module: titled },
	{ id: "_root_/none", path: "/none", module: untitled },
]
return { router: api.router.createRouter({ layouts: { _root_: root }, routeTree }) }
`)

// A click on the anchor to `path`, then the title once the page under `marker` has painted.
async function titleAfter(tab: Page, path: string, marker: string): Promise<string> {
	await tab.click(`#to${path.replaceAll("/", "-")}`)
	await tab.waitForFunction((at) => location.pathname === at, path)
	await tab.waitForFunction((id) => id === "" || document.getElementById(id) !== null, marker)
	await tab.waitForTimeout(100)
	return tab.evaluate(() => document.title)
}

// From a titled post to a post whose loader fails, from a titled page to one whose `.head()` throws, and from a
// titled page to one with no title: each title is the hard load's, "" (BUGS.md 428).
async function titleSteps(tab: Page): Promise<void> {
	const seen: string[] = []
	await tab.waitForFunction(() => document.title === "Post 1")
	seen.push(await titleAfter(tab, "/p/bad", ""))
	seen.push(await titleAfter(tab, "/q/1", "quiz"))
	seen.push(await titleAfter(tab, "/q/bad", "quiz"))
	seen.push(await titleAfter(tab, "/a", "titled"))
	seen.push(await titleAfter(tab, "/none", "untitled"))
	await tab.evaluate((all) => (Reflect.get(window, "__flareRecord") as unknown[]).push(...all), seen)
}

describe.each(ENGINES)("%s", (engine) => {
	it("head after navigation", async () => {
		if (harness === undefined) throw new Error("the harness did not start")
		const result = await harness.app(engine, { app: APP, path: "/p/1", steps: titleSteps, client() {} })
		expect(result.record).toEqual(["", "Q 1", "", "A", ""])
	})
})

// Custom tags on /c, the same script with a new body on /c2, none on /plain, and on /slow a script behind an 800 ms
// loader. Each page's marker is its own `<p>`.
const CUSTOM = appFrom(`
const anchor = (to) => api.solid.createComponent(api.web.Dynamic, { component: "a", href: to, id: "to" + to.replaceAll("/", "-"), children: to })
const root = api.rootLayout.createRootLayout("_root_").render((props) => api.h("html", "doc", () => [
	api.h("head", "head"),
	api.h("body", "body", () => [...["/c", "/c2", "/plain", "/slow", "/o"].map(anchor), api.h("main", "slot", () => props.children)]),
]))
const custom = (body) => ({
	custom: {
		links: [{ rel: "preconnect", href: "https://x.example" }],
		scripts: [{ children: body }],
		styles: [{ children: "#c{color:rgb(1,2,3)}" }],
	},
})
const c = api.page.createPage("_root_/c").head(() => custom("window.__c=(window.__c||0)+1")).render(() => api.h("p", "c", () => "c"))
const c2 = api.page.createPage("_root_/c2").head(() => custom("window.__c2=(window.__c2||0)+1")).render(() => api.h("p", "c2", () => "c2"))
const plain = api.page.createPage("_root_/plain").render(() => api.h("p", "plain", () => "plain"))
const slow = api.page.createPage("_root_/slow")
	.loader(() => new Promise((resolve) => setTimeout(() => resolve({}), 800)))
	.head(() => ({ custom: { scripts: [{ children: "window.__slow=1" }] } }))
	.render(() => api.h("p", "slow", () => "slow"))
// A same-origin script that answers 200 ms late, and a page whose inline script must run after it, as on a hard load.
const lib = api.page.createPage("_root_/lib").response(() => new Promise((resolve) => setTimeout(() => resolve(new Response("window.__order=(window.__order||[]).concat('lib')", { headers: { "content-type": "text/javascript" } })), 200)))
const ordered = api.page.createPage("_root_/o")
	.head(() => ({ custom: { scripts: [{ src: "/lib" }, { children: "window.__order=(window.__order||[]).concat('init')" }] } }))
	.render(() => api.h("p", "o", () => "o"))
const routeTree = [
	{ id: "_root_/lib", path: "/lib", module: lib },
	{ id: "_root_/o", path: "/o", module: ordered },
	{ id: "_root_/c", path: "/c", module: c },
	{ id: "_root_/c2", path: "/c2", module: c2 },
	{ id: "_root_/plain", path: "/plain", module: plain },
	{ id: "_root_/slow", path: "/slow", module: slow },
]
return { router: api.router.createRouter({ layouts: { _root_: root }, routeTree }) }
`)

// How many inline scripts, preconnect links, and custom styles the head holds, and what the scripts ran.
async function customHead(tab: Page): Promise<Record<string, unknown>> {
	return tab.evaluate(() => {
		const head = document.head
		return {
			scripts: [...head.querySelectorAll("script:not([src])")].filter((s) => s.textContent?.includes("window.__"))
				.length,
			links: head.querySelectorAll('link[rel="preconnect"]').length,
			styles: [...head.querySelectorAll("style")].filter((s) => s.textContent?.includes("#c{")).length,
			c: Reflect.get(window, "__c") ?? 0,
			c2: Reflect.get(window, "__c2") ?? 0,
			slow: Reflect.get(window, "__slow") ?? 0,
		}
	})
}

async function goTo(tab: Page, path: string, marker: string): Promise<void> {
	await tab.click(`#to${path.replaceAll("/", "-")}`)
	await tab.waitForFunction((id) => document.getElementById(id) !== null, marker)
	await tab.waitForTimeout(100)
}

// Hydrated on /c: each custom tag once in the served HTML and once in the head, and the script ran once. On /plain
// they are gone; on /c2 the script with its new body runs. A navigation to /slow that /plain cancels before its
// commit inserts nothing. On /o the inline script runs after the external one before it, as on a hard load
// (BUGS.md 460).
async function customSteps(tab: Page): Promise<void> {
	const record = (value: unknown) =>
		tab.evaluate((item) => (Reflect.get(window, "__flareRecord") as unknown[]).push(item), value)
	// The served document's head as the parser reads it: the state script carries the head config as data, not as an
	// element.
	const served = await tab.evaluate(async () => {
		const html = await (await fetch(location.href)).text()
		const head = new DOMParser().parseFromString(html, "text/html").head
		return {
			scripts: [...head.querySelectorAll("script")].filter((s) => s.textContent?.startsWith("window.__c=")).length,
			links: head.querySelectorAll('link[rel="preconnect"]').length,
			styles: [...head.querySelectorAll("style")].filter((s) => s.textContent?.includes("#c{")).length,
		}
	})
	await record({ served })
	await tab.waitForTimeout(100)
	await record(await customHead(tab))
	await goTo(tab, "/plain", "plain")
	await record(await customHead(tab))
	await goTo(tab, "/c2", "c2")
	await record(await customHead(tab))
	await tab.click("#to-slow")
	await tab.waitForTimeout(50)
	await goTo(tab, "/plain", "plain")
	await tab.waitForTimeout(1000)
	await record({ ...(await customHead(tab)), path: await tab.evaluate(() => location.pathname) })
	await goTo(tab, "/o", "o")
	await tab.waitForFunction(() => (Reflect.get(window, "__order") as unknown[] | undefined)?.length === 2)
	await record(await tab.evaluate(() => Reflect.get(window, "__order")))
}

describe.each(ENGINES)("%s", (engine) => {
	it("custom tags owned", async () => {
		if (harness === undefined) throw new Error("the harness did not start")
		const result = await harness.app(engine, { app: CUSTOM, path: "/c", steps: customSteps, client() {} })
		expect(result.record).toEqual([
			{ served: { scripts: 1, links: 1, styles: 1 } },
			{ scripts: 1, links: 1, styles: 1, c: 1, c2: 0, slow: 0 },
			{ scripts: 0, links: 0, styles: 0, c: 1, c2: 0, slow: 0 },
			{ scripts: 1, links: 1, styles: 1, c: 1, c2: 1, slow: 0 },
			{ scripts: 0, links: 0, styles: 0, c: 1, c2: 1, slow: 0, path: "/plain" },
			["lib", "init"],
		])
	})
})
