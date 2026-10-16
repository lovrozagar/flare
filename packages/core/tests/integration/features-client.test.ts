import { dirname, resolve } from "node:path"
import type { Page } from "@playwright/test"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { appFrom } from "./harness-app.ts"
import type { AppCase } from "./hydrate.app.ts"
import { ENGINES, startHarness, type AppResult, type Engine, type Harness } from "./hydrate.harness.ts"

// dx/features.md's theme, direction, locale, and cross-tab rows in the browser, through the hydrate harness with the
// real createServer and createClient (B96). The root writes ThemeScript, DirectionScript, and LocaleScript in its
// head and wraps the page in the three providers, as an app's root layout does. The page shows each value and has a
// button per setter.

let harness: Harness | undefined

beforeAll(async () => {
	harness = await startHarness(resolve(dirname(expect.getState().testPath ?? ""), "../.."))
})

afterAll(async () => {
	await harness?.close()
})

function run(engine: Engine, visit: Pick<AppCase, "path" | "steps" | "init" | "hydrateAfter">): Promise<AppResult> {
	if (harness === undefined) throw new Error("the harness did not start")
	return harness.app(engine, { ...visit, app: APP, client() {} })
}

const APP = appFrom(`
const config = { locales: ["en", "ar", "hr"], defaultLocale: "en" }
const c = api.solid.createComponent
const button = (id, onClick) => c(api.web.Dynamic, { component: "button", id, onClick, children: id })
const Panel = () => {
	const theme = api.theme.useTheme()
	const dir = api.direction.useDirection()
	const loc = api.i18n.useLocale()
	return [
		api.h("span", "theme", () => theme.theme()),
		api.h("span", "resolved", () => theme.resolvedTheme()),
		api.h("span", "dir", () => dir.direction()),
		api.h("span", "locale", () => loc.locale()),
		button("to-dark", () => theme.setTheme("dark")),
		button("to-light", () => theme.setTheme("light")),
		button("rtl", () => dir.setDirection("rtl")),
		button("clear-dir", () => dir.setDirection()),
		button("to-hr", () => loc.setLocale("hr")),
		button("to-en", () => loc.setLocale("en")),
	]
}
const root = api.rootLayout.createRootLayout("[[locale]]/_root_").render((props) =>
	c(api.i18n.LocaleProvider, {
		config,
		get initial() { return props.params.locale },
		get children() {
			return api.h("html", "doc", () => [
				api.h("head", "head", () => [
					c(api.theme.ThemeScript, {}),
					c(api.direction.DirectionScript, { get locale() { return props.params.locale } }),
					c(api.i18n.LocaleScript, {}),
				]),
				api.h("body", "body", () => [
					c(api.theme.ThemeProvider, {
						get children() {
							return c(api.direction.DirectionProvider, {
								get locale() { return props.params.locale },
								get children() { return [c(Panel, {}), api.h("main", "slot", () => props.children)] },
							})
						},
					}),
				]),
			])
		},
	}),
)
const home = api.page.createPage("[[locale]]/_root_/home").render(() => "home")
return {
	router: api.router.createRouter({
		layouts: { "[[locale]]/_root_": root },
		routeTree: [{ id: "[[locale]]/_root_/home", path: "/[[locale]]/home", module: home }],
		theme: { attribute: "data-mode", storageKey: "mode" },
		direction: { attribute: "data-dir", storageKey: "dirkey" },
		locale: config,
	}),
}
`)

// What the page shows and holds: the values, the html attributes, and storage.
async function state(tab: Page): Promise<Record<string, unknown>> {
	return tab.evaluate(() => {
		const html = document.documentElement
		const [theme, resolved, dir, locale] = ["theme", "resolved", "dir", "locale"].map(
			(id) => document.getElementById(id)?.textContent,
		)
		return {
			theme,
			resolved,
			dir,
			locale,
			mode: html.getAttribute("data-mode"),
			scheme: html.style.colorScheme,
			dataDir: html.getAttribute("data-dir"),
			htmlDir: html.getAttribute("dir"),
			lang: html.lang,
			stored: { mode: localStorage.getItem("mode"), dir: localStorage.getItem("dirkey") },
			path: location.pathname,
		}
	})
}

async function remember(tab: Page, value: unknown): Promise<void> {
	await tab.evaluate((item) => (Reflect.get(window, "__flareRecord") as unknown[]).push(item), value)
}

// Before the page loads: storage holds `stored`, the color scheme is `scheme`, and the attributes the scripts set are
// read at DOMContentLoaded, before the client hydrates (the client waits `hydrateAfter`).
function before(stored: Record<string, string>, scheme: "light" | "dark") {
	return async (tab: Page): Promise<void> => {
		await tab.emulateMedia({ colorScheme: scheme })
		await tab.addInitScript((entries: Record<string, string>) => {
			for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value)
			document.addEventListener("DOMContentLoaded", () => {
				const html = document.documentElement
				Reflect.set(window, "__early", {
					mode: html.getAttribute("data-mode"),
					dir: html.getAttribute("dir"),
					lang: html.lang,
				})
				// Every style added to the head after the scripts ran, by its text: setTheme's transition guard.
				const added: string[] = []
				Reflect.set(window, "__styles", added)
				new MutationObserver((records) => {
					for (const node of records.flatMap((record) => [...record.addedNodes])) {
						if (node.nodeName === "STYLE") added.push(node.textContent ?? "")
					}
				}).observe(document.head, { childList: true })
			})
		}, stored)
	}
}

async function early(tab: Page): Promise<void> {
	await remember(tab, await tab.evaluate(() => Reflect.get(window, "__early")))
	await remember(tab, await state(tab))
}

async function click(tab: Page, id: string, until: (state: Record<string, unknown>) => boolean): Promise<void> {
	await tab.evaluate((button) => document.getElementById(button)?.click(), id)
	for (let tries = 0; tries < 100 && !until(await state(tab)); tries++) await tab.waitForTimeout(20)
	await remember(tab, await state(tab))
}

// The dark theme set over a light system, then the media turned light again; and whether setTheme's no-transition
// style came and went.
async function setTheme(tab: Page): Promise<void> {
	await click(tab, "to-dark", (now) => now["mode"] === "dark")
	await tab.emulateMedia({ colorScheme: "light" })
	await remember(tab, await state(tab))
	await tab.waitForFunction(
		() => ![...document.head.querySelectorAll("style")].some((style) => style.textContent?.includes("transition:none")),
	)
	await remember(tab, await tab.evaluate(() => Reflect.get(window, "__styles")))
}

async function mediaDark(tab: Page): Promise<void> {
	await tab.emulateMedia({ colorScheme: "dark" })
	await tab.waitForFunction(() => document.documentElement.getAttribute("data-mode") === "dark")
	await remember(tab, await state(tab))
}

async function setDirection(tab: Page): Promise<void> {
	await click(tab, "rtl", (now) => now["htmlDir"] === "rtl")
	await click(tab, "clear-dir", (now) => now["htmlDir"] === "ltr")
}

async function setLocale(tab: Page): Promise<void> {
	await remember(tab, await state(tab))
	await click(tab, "to-en", (now) => now["path"] === "/home" && now["lang"] === "en")
	await remember(tab, (await tab.context().cookies()).find((cookie) => cookie.name === "flare.locale")?.value)
}

// A second tab of the same app, and the first tab's three setters.
async function crossTab(tab: Page): Promise<void> {
	const other = await tab.context().newPage()
	await other.goto(tab.url())
	await other.waitForSelector("html[data-flare-hydrated]", { state: "attached" })
	await tab.evaluate(() => document.getElementById("to-dark")?.click())
	await other.waitForFunction(() => document.documentElement.getAttribute("data-mode") === "dark")
	await tab.evaluate(() => document.getElementById("rtl")?.click())
	await other.waitForFunction(() => document.documentElement.getAttribute("dir") === "rtl")
	await tab.evaluate(() => document.getElementById("to-hr")?.click())
	await other.waitForFunction(() => location.pathname === "/hr/home")
	await remember(tab, await state(other))
}

describe.each(ENGINES)("%s", (engine) => {
	// ThemeScript sets the attribute and colorScheme before paint from storage; a value outside `themes` is
	// defaultTheme, `system` follows the media query; after hydration `theme()` reads storage.
	it("theme script", async () => {
		const cases = [
			[{ mode: "dark" }, "light", { mode: "dark", dir: "ltr", lang: "en" }, "dark", "dark"],
			[{ mode: "sepia" }, "dark", { mode: "dark", dir: "ltr", lang: "en" }, "system", "dark"],
			[{}, "light", { mode: "light", dir: "ltr", lang: "en" }, "system", "light"],
		] as const
		for (const [stored, scheme, scripted, theme, resolved] of cases) {
			const result = await run(engine, { path: "/home", init: before(stored, scheme), hydrateAfter: 200, steps: early })
			expect(result.problems).toEqual([])
			expect(result.record[0]).toEqual(scripted)
			expect(result.record[1]).toMatchObject({ theme, resolved, mode: resolved, scheme: resolved })
		}
	})

	// setTheme writes storage, then the attribute and colorScheme; a media change moves a `system` theme only.
	it("set theme", async () => {
		const result = await run(engine, { path: "/home", init: before({}, "light"), steps: setTheme })
		expect(result.problems).toEqual([])
		expect(result.record[0]).toMatchObject({
			theme: "dark",
			mode: "dark",
			scheme: "dark",
			stored: { mode: "dark", dir: null },
		})
		expect(result.record[1]).toMatchObject({ theme: "dark", mode: "dark" })
		// disableTransitionOnChange: the change inserted `*{transition:none!important}`, removed on the next frame.
		expect(result.record[2]).toEqual(["*{transition:none!important}"])
		const system = await run(engine, { path: "/home", init: before({}, "light"), steps: mediaDark })
		expect(system.record[0]).toMatchObject({ theme: "system", resolved: "dark", mode: "dark" })
	})
})

describe.each(ENGINES)("%s", (engine) => {
	// DirectionScript sets the dir from the locale, or from a stored value, before paint; `data-dir` mirrors it.
	// setDirection writes storage; setDirection() removes it and returns to the locale's dir.
	it("direction", async () => {
		const arabic = await run(engine, { path: "/ar/home", init: before({}, "light"), hydrateAfter: 200, steps: early })
		expect(arabic.record[0]).toMatchObject({ dir: "rtl" })
		expect(arabic.record[1]).toMatchObject({ dir: "rtl", dataDir: "rtl", htmlDir: "rtl" })
		const init = before({ dirkey: "ltr" }, "light")
		const stored = await run(engine, { path: "/ar/home", init, hydrateAfter: 200, steps: early })
		expect(stored.record[0]).toMatchObject({ dir: "ltr" })
		const set = await run(engine, { path: "/home", init: before({}, "light"), steps: setDirection })
		expect(set.problems).toEqual([])
		expect(set.record).toMatchObject([
			{ dir: "rtl", dataDir: "rtl", stored: { dir: "rtl" } },
			{ dir: "ltr", dataDir: "ltr", stored: { dir: null } },
		])
	})

	// LocaleScript sets `lang` before hydration; setLocale navigates on the current route (the default drops the
	// optional segment), writes the cookie, and `lang` follows.
	it("locale", async () => {
		const scripted = await run(engine, { path: "/hr/home", init: before({}, "light"), hydrateAfter: 200, steps: early })
		expect(scripted.record[0]).toMatchObject({ lang: "hr" })
		const result = await run(engine, { path: "/hr/home", init: before({}, "light"), steps: setLocale })
		expect(result.problems).toEqual([])
		expect(result.record).toMatchObject([
			{ locale: "hr", lang: "hr", path: "/hr/home" },
			{ locale: "en", lang: "en", path: "/home" },
			"en",
		])
	})

	// Another tab of the same app hears each setter through `flare.sync`: the theme, the direction, and the locale,
	// which navigates it on its own route.
	it("cross tab", async () => {
		const result = await run(engine, { path: "/home", init: before({}, "light"), steps: crossTab })
		expect(result.problems).toEqual([])
		expect(result.record[0]).toMatchObject({
			theme: "dark",
			mode: "dark",
			dir: "rtl",
			htmlDir: "rtl",
			locale: "hr",
			path: "/hr/home",
		})
	})
})
