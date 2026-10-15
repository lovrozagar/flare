import { dataRequests, deepOnly, documents, expect, open, test } from "./docs.fixture.ts"
import { flushEvents } from "./flush.ts"

// Links, prefetch, view transitions, progress, the blocker, scroll, intercepts, and every hook (bits/15).
deepOnly()

test("active link", async ({ page, docs }) => {
	await open(page, docs.origin, "/docs/routing")
	const sidebar = page.locator("#sidebar")
	const routing = sidebar.getByRole("link", { name: "Routing" })
	await expect(routing).toHaveAttribute("data-active", "true")
	await expect(routing).toHaveAttribute("aria-current", "page")
	await expect(routing).toHaveClass(/bg-flame-500\/10/)
	await expect(sidebar.getByRole("link", { name: "Caching" })).toHaveAttribute("data-active", "false")
	await expect(page.locator("#nav").getByRole("link", { name: "Docs" })).toHaveClass(/bg-stone-200\/70/)
})

// /hr/docs/i18n renders with its feedback tally, loaded directly and reached from the sidebar: its slug passes the
// feedback input, and nothing replaces the page with "Something broke" (BUGS.md 64).
test("i18n page", async ({ page, docs }) => {
	const problems = await open(page, docs.origin, "/hr/docs/i18n")
	await expect(page.locator("#doc-title")).toHaveText("Locales, theme, direction")
	await expect(page.locator("#votes-up")).toHaveText("0")
	await open(page, docs.origin, "/hr/docs/styling")
	await page.locator('#sidebar a[href="/hr/docs/i18n"]').click()
	await expect(page.locator("#doc-title")).toHaveText("Locales, theme, direction")
	await expect(page.locator("#votes-up")).toBeVisible()
	await expect(page.getByText("Something broke")).toHaveCount(0)
	expect(problems).toEqual([])
})

// The new page's feedback read is held pending by the test: the page commits at once with the feedback skeleton, and
// in every frame the URL, the title, and the one active sidebar link agree. A second click while that read is pending
// commits its own page cleanly (B106, BUGS.md 62).
test("pending read", async ({ page, docs }) => {
	const problems = await open(page, docs.origin, "/hr/docs/styling")
	await page.route("**/_flare/fn/**", (route) => (route.request().method() === "GET" ? undefined : route.continue()))
	const frames = page.evaluate(
		() =>
			new Promise<string[]>((resolve) => {
				const seen: string[] = []
				const start = performance.now()
				const tick = () => {
					const title = document.querySelector("#doc-title")?.textContent ?? ""
					const active = document.querySelectorAll('#sidebar a[data-active="true"]').length
					const skeleton = document.querySelector("#feedback-loading") !== null
					seen.push(`${location.pathname}|${title}|${active}|${skeleton}`)
					if (performance.now() - start < 1500) requestAnimationFrame(tick)
					else resolve(seen)
				}
				requestAnimationFrame(tick)
			}),
	)
	await page.locator('#sidebar a[href="/hr/docs/i18n"]').click()
	const seen = await frames
	const moved = seen.filter((frame) => frame.startsWith("/hr/docs/i18n|"))
	expect(moved.length).toBeGreaterThan(0)
	expect(new Set(moved)).toEqual(new Set(["/hr/docs/i18n|Locales, theme, direction|1|true"]))
	expect(
		seen.filter((frame) => frame.startsWith("/hr/docs/styling|")).every((frame) => frame.includes("|Styling|")),
	).toBe(true)
	await page.locator('#sidebar a[href="/hr/docs/middleware"]').click()
	await expect(page.locator("#doc-title")).toHaveText("Middleware and mounts")
	await expect(page).toHaveURL(`${docs.origin}/hr/docs/middleware`)
	await expect(page.locator('#sidebar a[data-active="true"]')).toHaveCount(1)
	expect(problems).toEqual([])
})

// The scroll a navigation makes is final when the view transition captures the new page: a card from a scrolled home
// lands at the top in the transition's first frame, and Back from a scrolled doc page shows home at its saved
// position in the first frame and after, with no jump (B108, BUGS.md 65).
test("back keeps scroll", async ({ page, docs, floor }) => {
	await page.addInitScript(() => {
		const seen: string[] = []
		Reflect.set(window, "__scroll", seen)
		const start = Document.prototype.startViewTransition
		if (typeof start !== "function") return
		Document.prototype.startViewTransition = function (this: Document, arg?: never) {
			const transition = start.call(this, arg)
			void transition.ready.then(() => {
				seen.push(`ready ${Math.round(scrollY)}`)
				requestAnimationFrame(() => seen.push(`frame ${Math.round(scrollY)}`))
			})
			return transition
		}
	})
	await open(page, docs.origin, "/")
	// The docs set no smooth scrolling, so a scroll lands at once, and each navigation is recorded once its
	// transition's first frame has run. The floor has no view transitions (floor.ts), so there it is recorded once the
	// page is there, and only the restored position is checked.
	const framed = () =>
		page.evaluate(() => (Reflect.get(window, "__scroll") as string[]).some((entry) => entry.startsWith("frame")))
	const transitions = !floor
	await page.evaluate(() => window.scrollTo(0, 500))
	const home = await page.evaluate(() => Math.round(scrollY))
	expect(home).toBe(500)
	await page.evaluate(() => document.querySelector<HTMLAnchorElement>("section.grid a")?.click())
	await expect(page.locator("#doc-title")).toBeVisible()
	if (transitions) {
		await expect.poll(framed).toBe(true)
		const forward = await page.evaluate(() => (Reflect.get(window, "__scroll") as string[]).splice(0))
		expect(forward.filter((entry) => !entry.endsWith(" 0"))).toEqual([])
	}
	await page.evaluate(() => window.scrollTo(0, 400))
	await page.evaluate(() => history.back())
	await expect(page.locator("section.grid a").first()).toBeVisible()
	if (transitions) {
		await expect.poll(framed).toBe(true)
		const back = await page.evaluate(() => (Reflect.get(window, "__scroll") as string[]).splice(0))
		expect(back.length).toBeGreaterThan(0)
		expect(back).toEqual(back.map((entry) => `${entry.split(" ")[0]} ${home}`))
	}
	await expect.poll(() => page.evaluate(() => Math.round(scrollY))).toBe(home)
})

test("disabled link", async ({ page, docs }) => {
	await open(page, docs.origin, "/docs/media")
	const next = page.locator("#next")
	await expect(next).toHaveAttribute("aria-disabled", "true")
	await expect(next).toHaveAttribute("tabindex", "-1")
	await next.click({ force: true })
	expect(new URL(page.url()).pathname).toBe("/docs/media")
})

test("hash link", async ({ page, docs }) => {
	await open(page, docs.origin, "/docs/routing")
	const requests = dataRequests(page)
	await page.locator("#toc").getByRole("link", { name: "Params" }).click()
	await expect(page).toHaveURL(`${docs.origin}/docs/routing#params`)
	await expect(page.locator("#params")).toBeInViewport()
	expect(requests).toEqual([])
})

test("prefetch data intent", async ({ page, docs }) => {
	await open(page, docs.origin, "/docs/routing")
	const requests = dataRequests(page)
	await page.locator("#sidebar").getByRole("link", { name: "Caching" }).hover()
	await expect.poll(() => requests.some((seen) => seen.kind === "prefetch" && seen.path === "/docs/caching")).toBe(true)
})

test("prefetch viewport", async ({ page, docs }) => {
	const requests = dataRequests(page)
	await open(page, docs.origin, "/")
	await page.locator('[data-feature="media"]').scrollIntoViewIfNeeded()
	await expect.poll(() => requests.some((seen) => seen.kind === "prefetch" && seen.path === "/docs/media")).toBe(true)
})

test("prefetch off", async ({ page, docs }) => {
	await open(page, docs.origin, "/")
	const requests = dataRequests(page)
	await page.getByRole("link", { name: "Open the playground" }).hover()
	// An intent prefetch leaves from the pointer's own event, so a flush after the hover has seen any.
	await flushEvents(page)
	expect(requests.filter((seen) => seen.path === "/playground")).toEqual([])
})

// Record every view transition the router starts, on the document or on an element.
async function recordTransitions(page: import("@playwright/test").Page): Promise<void> {
	await page.addInitScript(() => {
		const calls: { on: string; types: string[] }[] = []
		Reflect.set(window, "__transitions", calls)
		const wrap = (proto: object, label: (self: unknown) => string): void => {
			const original: unknown = Reflect.get(proto, "startViewTransition")
			if (typeof original !== "function") return
			Reflect.set(proto, "startViewTransition", function (this: unknown, options: { types?: string[] }) {
				calls.push({ on: label(this), types: [...(options?.types ?? [])] })
				return Reflect.apply(original, this, [options])
			})
		}
		wrap(Document.prototype, () => "document")
		wrap(Element.prototype, (self) => (self instanceof Element ? self.id : "element"))
	})
}

// Every navigation's transition runs on the document, the default scope (B119 (5)): from the top of a doc page, from a
// doc page scrolled to its bottom (BUGS.md 119.2), and Back to a scrolled doc page (BUGS.md 119.3). An element-scoped
// one drew the old image at a box the navigation's scroll had moved.
test("view transition document", async ({ page, docs, floor }) => {
	test.skip(floor, "the floor has no view transitions (floor.ts); its navigations run in the other cases")
	await recordTransitions(page)
	await open(page, docs.origin, "/docs/routing")
	const calls = async (): Promise<string[]> =>
		(await page.evaluate(() => Reflect.get(window, "__transitions") as { on: string }[])).map((call) => call.on)
	await page.locator("#sidebar").getByRole("link", { name: "Caching" }).click()
	await expect(page.locator("#doc-title")).toHaveText("Caching")
	await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
	await page.locator('#sidebar a[href="/docs/defer"]').click()
	await expect(page.locator("#doc-title")).toHaveText("Deferred data")
	await page.evaluate(() => window.scrollTo(0, 900))
	await page.locator('#nav a[href="/api/server/create-server"]').click()
	await expect(page).toHaveURL(/\/api\/server\/create-server/)
	await page.goBack()
	await expect(page.locator("#doc-title")).toHaveText("Deferred data")
	await expect.poll(calls).toHaveLength(4)
	expect(await calls()).toEqual(["document", "document", "document", "document"])
})

// The transition keeps its old snapshot, so the old content crossfades out (the user's call of 2026-10-15, withdrawing
// B125's hide). The guide's article is a boundary, so the snapshot is the content's, not the root's (B129): once the
// transition is ready, `::view-transition-old(flare-content)` is animated and its computed display is block. A computed
// style alone would read block for a pseudo-element the transition never made. Engines without the API have no
// transition to read.
test("old snapshot shown", async ({ page, docs, floor }) => {
	test.skip(floor, "the floor has no view transitions (floor.ts)")
	await page.addInitScript(() => {
		const start = Document.prototype.startViewTransition
		if (typeof start !== "function") return
		Document.prototype.startViewTransition = function (this: Document, arg?: never) {
			const transition = start.call(this, arg)
			void transition.ready.then(
				() => {
					const old = "::view-transition-old(flare-content)"
					const animated = document
						.getAnimations()
						.some((animation) => (animation.effect as KeyframeEffect | null)?.pseudoElement === old)
					const display = getComputedStyle(document.documentElement, old).display
					Reflect.set(window, "__oldDisplay", animated ? display : "not animated")
				},
				() => undefined,
			)
			return transition
		}
	})
	await open(page, docs.origin, "/docs/routing")
	const supported = await page.evaluate(() => typeof document.startViewTransition === "function")
	test.skip(!supported, "this engine has no document.startViewTransition")
	await page.locator("#sidebar").getByRole("link", { name: "Caching" }).click()
	await expect(page.locator("#doc-title")).toHaveText("Caching")
	await expect.poll(() => page.evaluate(() => Reflect.get(window, "__oldDisplay"))).toBe("block")
})

test("view transition off", async ({ page, docs }) => {
	await recordTransitions(page)
	await open(page, docs.origin, "/docs/caching")
	await page.locator("#prev").click()
	await expect(page.locator("#doc-title")).not.toHaveText("Caching")
	expect(await page.evaluate(() => Reflect.get(window, "__transitions"))).toEqual([])
})

test("progress bar", async ({ page, docs }) => {
	await open(page, docs.origin, "/docs/routing")
	// The click's hover starts an intent prefetch, and the navigation takes it over, so both kinds wait (BUGS.md B43).
	// They wait until the bar has been seen, not for a fixed time: on a slow runner the click came more than a fixed
	// delay after its hover, and the navigation found the prefetch already in (BUGS.md 101).
	const release = Promise.withResolvers<void>()
	await page.route(/_flare=(data|prefetch)/, async (route) => {
		await release.promise
		await route.continue()
	})
	await page.locator("#sidebar").getByRole("link", { name: "Auth" }).click()
	await expect(page.locator("#progress")).toHaveAttribute("data-pending", "true")
	await expect(page.locator("#progress")).not.toHaveCSS("opacity", "0")
	release.resolve()
	await expect(page.locator("#doc-title")).toHaveText("Auth")
	await expect(page.locator("#progress")).toHaveAttribute("data-pending", "false")
	await expect(page.locator("#progress")).toHaveCSS("opacity", "0")
})

test("blocker", async ({ page, docs }) => {
	await open(page, docs.origin, "/playground")
	await page.locator("#draft").fill("unsaved idea")
	const requests = dataRequests(page)
	page.once("dialog", (dialog) => void dialog.dismiss())
	await page.locator("#nav").getByRole("link", { name: "Changelog" }).click()
	// A navigation the dismissal let through would send its data request at once, before the flush.
	await flushEvents(page)
	expect(requests.filter((seen) => seen.kind === "data" && seen.path === "/changelog")).toEqual([])
	expect(new URL(page.url()).pathname).toBe("/playground")
	page.once("dialog", (dialog) => void dialog.accept())
	await page.locator("#nav").getByRole("link", { name: "Changelog" }).click()
	await expect(page).toHaveURL(`${docs.origin}/changelog`)
})

test("scroll restoration", async ({ page, docs }) => {
	await open(page, docs.origin, "/docs/routing")
	await page.evaluate(() => window.scrollTo(0, 700))
	await page.locator("#sidebar").getByRole("link", { name: "Caching" }).click()
	await expect(page.locator("#doc-title")).toHaveText("Caching")
	expect(await page.evaluate(() => window.scrollY)).toBe(0)
	await page.goBack()
	await expect(page.locator("#doc-title")).toHaveText("Routing")
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(600)
})

test("search intercept", async ({ page, docs }) => {
	await open(page, docs.origin, "/")
	await page.locator("#search-input").fill("route")
	await page.locator("#search-input").press("Enter")
	const modal = page.locator("#search-modal")
	await expect(modal).toBeVisible()
	await expect(modal).toHaveAttribute("data-background", "/")
	await expect(modal).toHaveAttribute("data-label", "search-modal")
	await expect(page).toHaveURL(`${docs.origin}/search?q=route`)
	await expect(page.locator("#message")).toBeVisible()
	await expect(modal.locator("#results li").first()).toBeVisible()
	await page.locator("#modal-close").click()
	await expect(modal).toHaveCount(0)
	await expect(page).toHaveURL(`${docs.origin}/`)
	await open(page, docs.origin, "/search?q=route")
	await expect(page.locator("#search-modal")).toHaveCount(0)
	await expect(page.locator("#search-page")).toBeVisible()
})

// The search page's input follows the URL's `q` across client navigations, back and forward included, while the page
// stays mounted.
test("search draft follows q", async ({ page, docs }) => {
	await open(page, docs.origin, "/search?q=route")
	const draft = page.locator("#search-page-input")
	await expect(draft).toHaveValue("route")
	const loads = documents(page)
	await page.locator("#search-input").fill("cache")
	await page.locator("#search-input").press("Enter")
	await expect(page).toHaveURL(`${docs.origin}/search?q=cache`)
	await expect(draft).toHaveValue("cache")
	await page.goBack()
	await expect(page).toHaveURL(`${docs.origin}/search?q=route`)
	await expect(draft).toHaveValue("route")
	await page.goForward()
	await expect(draft).toHaveValue("cache")
	expect(loads).toEqual([])
})

test("navigate state replace", async ({ page, docs }) => {
	await open(page, docs.origin, "/examples")
	const depth = await page.evaluate(() => history.length)
	await page.locator("#navigate-state").click()
	await expect(page).toHaveURL(`${docs.origin}/examples/state?tab=data`)
	expect(await page.evaluate(() => history.length)).toBe(depth)
	expect(await page.evaluate(() => Reflect.get(Object(history.state), "usr"))).toEqual({ from: "examples" })
})

test("shallow search", async ({ page, docs }) => {
	await open(page, docs.origin, "/examples?tab=cache")
	const request = await page.locator("#examples-request").textContent()
	const requests = dataRequests(page)
	await page.locator("#shallow-note").click()
	await expect(page).toHaveURL(`${docs.origin}/examples?note=shallow&tab=cache`)
	await expect(page.locator("#examples-note")).toHaveText("shallow")
	await expect(page.locator("#examples-request")).toHaveText(request ?? "")
	expect(requests).toEqual([])
})

test("revalidate", async ({ page, docs }) => {
	await open(page, docs.origin, "/examples?tab=data")
	const before = await page.locator("#examples-request").textContent()
	const requests = dataRequests(page)
	await page.locator("#revalidate").click()
	await expect(page.locator("#examples-request")).not.toHaveText(before ?? "")
	expect(requests.some((seen) => seen.kind === "data")).toBe(true)
	expect(new URL(page.url()).search).toBe("?tab=data")
})

test("hooks", async ({ page, docs }) => {
	await open(page, docs.origin, "/docs/routing")
	await expect(page.locator("#hook-params")).toHaveText('{"slug":"routing"}')
	await expect(page.locator("#hook-location")).toHaveText("/docs/routing")
	await expect(page.locator("#hook-match")).toContainText("[[locale]]/_root_/(guide)/docs/[slug]")
	await expect(page.locator("#hook-pending")).toHaveText("false")
	await expect(page.locator("#hook-docs-data")).toHaveText('{"stars":4200,"contributors":37}')
	await page.locator("#toc").getByRole("link", { name: "Files" }).click()
	await expect(page.locator("#hook-location")).toHaveText("/docs/routing#files")
	await expect(page.locator("#hook-last-navigation")).toHaveText("none yet")
	// A held navigation shows `pending: true`; once it commits, the panel keeps how long it was pending.
	const release = Promise.withResolvers<void>()
	await page.route("**/docs/caching?_flare=*", async (route) => {
		await release.promise
		await route.continue()
	})
	await page.locator("#sidebar").getByRole("link", { name: "Caching" }).click()
	await expect(page.locator("#hook-pending")).toHaveText("true")
	release.resolve()
	await expect(page.locator("#hook-pending")).toHaveText("false")
	await expect(page.locator("#hook-last-navigation")).toHaveText(/^\d+ ms$/)
})

test("preloader levels", async ({ page, docs }) => {
	await open(page, docs.origin, "/docs/routing")
	await expect(page.locator("#ctx-root")).toHaveText('{"version":"1.0","site":"Flare"}')
	await expect(page.locator("#ctx-guide")).toHaveText(
		'{"version":"1.0","site":"Flare","section":"guide","sidebar":"docs"}',
	)
	await expect(page.locator("#ctx-page")).toHaveText(
		'{"version":"1.0","site":"Flare","section":"docs page","sidebar":"docs","toc":["files","params"]}',
	)
})

test("lifecycle", async ({ page, docs }) => {
	await open(page, docs.origin, "/docs/routing")
	await expect(page.locator("#lifecycle")).toHaveText("ready /docs/routing → hydrated → idle")
	await page.mouse.click(5, 300)
	await expect(page.locator("#lifecycle")).toHaveText("ready /docs/routing → hydrated → idle → interaction")
})

test("locale switch", async ({ page, docs }) => {
	await open(page, docs.origin, "/docs/routing")
	const loads = documents(page)
	await page.locator("#hr").click()
	await expect(page).toHaveURL(`${docs.origin}/hr/docs/routing`)
	await expect(page.locator("#nav")).toContainText("Dokumentacija")
	expect(loads).toEqual([])
})
