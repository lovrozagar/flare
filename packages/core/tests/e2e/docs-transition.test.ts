import type { Page } from "@playwright/test"
import sharp from "sharp"
import { deepOnly, expect, open, test } from "./docs.fixture.ts"

// The docs guide's article is its ViewTransitionBoundary, so a navigation's transition captures only it (B129).
deepOnly()

type Clip = { x: number; y: number; width: number; height: number }
type Captured = { animated: string[]; moved: string[] }

// Holds a navigation's transition as it becomes ready: its animations pause in the same task as ready, so no round trip
// from the test can let it finish first (BUGS.md 126). Only the transition's own: the live page's animations, a hovered
// link's color among them, run on. What the transition animates is recorded then: each
// `::view-transition-*` pseudo-element with an animation, and whether a group's keyframes move it (a transform).
async function holdTransitions(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const start = Document.prototype.startViewTransition
		if (typeof start !== "function") return
		Document.prototype.startViewTransition = function (this: Document, arg?: never) {
			const transition = start.call(this, arg)
			void transition.ready.then(
				() => {
					const animated: string[] = []
					const moved: string[] = []
					for (const animation of document.getAnimations()) {
						const effect = animation.effect as KeyframeEffect | null
						const pseudo = effect?.pseudoElement ?? ""
						if (!pseudo.startsWith("::view-transition")) continue
						animation.pause()
						animated.push(pseudo)
						if (effect?.getKeyframes().some((frame) => frame["transform"] !== undefined)) moved.push(pseudo)
					}
					Reflect.set(window, "__animated", animated)
					Reflect.set(window, "__moved", moved)
					Reflect.set(window, "__running", true)
				},
				() => undefined,
			)
			void transition.finished.then(
				() => Reflect.set(window, "__running", false),
				() => undefined,
			)
			return transition
		}
	})
}

async function goTo(page: Page, y: number): Promise<void> {
	await page.evaluate((top) => window.scrollTo(0, top), y)
	await page.waitForFunction((top) => Math.round(scrollY) === top, y)
}

async function clipOf(page: Page, selector: string): Promise<Clip> {
	const box = await page.locator(selector).boundingBox()
	if (box === null) throw new Error(`no ${selector}`)
	const y = Math.max(0, Math.round(box.y))
	return { x: Math.round(box.x), y, width: Math.round(box.width), height: Math.min(Math.round(box.height), 900 - y) }
}

// A sidebar navigation from `scrolled`, held at ready: what it captured, and the header and sidebar clips while it
// runs and after it ends. The progress bar, a fixed bar over the header whose own CSS transitions run, is hidden in
// both, through CSSOM, since the docs app's CSP refuses an inserted style tag.
async function frames(page: Page, scrolled: number) {
	await page.evaluate(() => {
		const sheet = new CSSStyleSheet()
		sheet.replaceSync("#progress{visibility:hidden!important}")
		document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
	})
	await goTo(page, scrolled)
	await page.mouse.move(1250, 890)
	const clips = { header: await clipOf(page, "#nav"), sidebar: await clipOf(page, "#sidebar") }
	const shoot = async () => ({
		header: await page.screenshot({ clip: clips.header, animations: "allow" }),
		sidebar: await page.screenshot({ clip: clips.sidebar, animations: "allow" }),
	})
	await page.locator("#sidebar").getByRole("link", { name: "Caching" }).click()
	await page.waitForFunction(() => Reflect.get(window, "__running") === true)
	// Off the sidebar: from a scrolled page the sticky sidebar moves under a still pointer, and when an engine updates
	// that hover is its own timing (WebKit after the transition), not an animation.
	await page.mouse.move(1250, 890)
	const captured = await page.evaluate((): Captured => ({
		animated: Reflect.get(window, "__animated"),
		moved: Reflect.get(window, "__moved"),
	}))
	// The live chrome's own animations (the clicked link's hover color) end before the frame is read.
	await page.waitForFunction(() =>
		document
			.getAnimations()
			.every((animation) => !(animation.effect as KeyframeEffect | null)?.target?.closest("#nav, #sidebar")),
	)
	const mid = await shoot()
	await page.evaluate(() => {
		for (const animation of document.getAnimations()) animation.finish()
	})
	await page.waitForFunction(() => Reflect.get(window, "__running") === false)
	await expect(page.locator("#doc-title")).toHaveText("Caching")
	return { captured, mid, after: await shoot() }
}

// A second held transition from `scrolled`, the pointer on the /docs/defer link where the live page has it
// mid-transition: a navigation from a scrolled page lands at the top, and the sticky sidebar moves with it.
async function pointer(page: Page, scrolled: number) {
	await goTo(page, scrolled)
	await page.mouse.move(1250, 890)
	await page.locator("#sidebar").getByRole("link", { name: "Auth" }).click()
	await page.waitForFunction(() => Reflect.get(window, "__running") === true)
	const link = page.locator('#sidebar a[href="/docs/defer"]')
	const box = await link.boundingBox()
	if (box === null) throw new Error("no sidebar link")
	const [x, y] = [box.x + box.width / 2, box.y + box.height / 2]
	// Longer than the transition, as a loaded grid can be: a hold that did not take has finished by now.
	await page.waitForTimeout(400)
	const hit = await page.evaluate(
		([px, py]) => {
			const element = document.elementFromPoint(px ?? 0, py ?? 0)
			return element?.closest("a")?.getAttribute("href") ?? element?.tagName
		},
		[x, y],
	)
	await page.mouse.move(x, y)
	const hovered = await link.evaluate((element) => element.matches(":hover"))
	const running = await page.evaluate(() => Reflect.get(window, "__running"))
	await page.mouse.down()
	await page.mouse.up()
	await page.evaluate(() => {
		for (const animation of document.getAnimations()) animation.finish()
	})
	return { running, hit, hovered }
}

// The header and the sidebar stay live while a navigation's transition runs, from the top of a page and from a page
// scrolled to 700 (each page here scrolls 774 px at most), in every engine with view transitions. Live means three
// things. They are not animated: mid-transition, their clips equal the frame after the transition; against the
// pre-click frame they differ, since the active link and the header's backdrop update at once. The content does not
// slide: no transition group has a transform keyframe, while the content is captured and the root is not. And the
// pointer reaches them: the sidebar link is hit, hovered, and a click on it navigates. Before B129 Chromium, WebKit,
// and Safari hit-tested the document element during any transition and lost the click (BUGS.md 119.16).
for (const scrolled of [0, 700]) {
	test(`chrome stays live${scrolled > 0 ? " scrolled" : ""}`, async ({ page, docs, floor, browserName }) => {
		test.skip(floor, "the floor has no view transitions (floor.ts)")
		await holdTransitions(page)
		await page.setViewportSize({ width: 1261, height: 900 })
		await open(page, docs.origin, "/docs/routing")
		const supported = await page.evaluate(() => typeof document.startViewTransition === "function")
		test.skip(!supported, "this engine has no document.startViewTransition")
		const { captured, mid, after } = await frames(page, scrolled)
		expect(captured.animated, `${browserName}: the content is captured`).toEqual(
			expect.arrayContaining(["::view-transition-old(flare-content)", "::view-transition-new(flare-content)"]),
		)
		const root = captured.animated.filter((pseudo) => pseudo.includes("(root)"))
		expect(root, `${browserName}: the root is not captured`).toEqual([])
		expect(captured.moved, `${browserName}: no group slides`).toEqual([])
		expect(mid.header.equals(after.header), `${browserName}: the header is not animated`).toBe(true)
		expect(mid.sidebar.equals(after.sidebar), `${browserName}: the sidebar is not animated`).toBe(true)
		const seen = await pointer(page, scrolled)
		expect(seen, browserName).toEqual({ running: true, hit: "/docs/defer", hovered: true })
		await expect(page.locator("#doc-title"), `${browserName}: the click navigates`).toHaveText("Deferred data")
	})
}

// How many pixels of a screenshot are the docs' progress bar: its gradient runs from flame-500 to amber-300, so red
// is high and blue low, which neither theme's header background is.
async function barPixels(png: Buffer): Promise<number> {
	const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
	let count = 0
	for (let index = 0; index < data.length; index += info.channels) {
		const [red = 0, blue = 0] = [data[index], data[index + 2]]
		if (red > 200 && red - blue > 100) count++
	}
	return count
}

// A page outside the guide has no ViewTransitionBoundary, so its navigation's transition captures the root. The
// progress bar is fixed over the header and shown while the navigation fetches, so the root's old image would hold a
// copy of it frozen at its trickle width while the live bar completes and fades (BUGS.md 119.12). The data request
// is held until the bar is fully shown, so the capture always has it to freeze. At the transition's ready the live bar
// is hidden: any bar left in the frame is a captured copy.
test("bar not captured", async ({ page, docs, floor, browserName }) => {
	test.skip(floor, "the floor has no view transitions (floor.ts)")
	await holdTransitions(page)
	await page.setViewportSize({ width: 1261, height: 900 })
	await open(page, docs.origin, "/changelog")
	const supported = await page.evaluate(() => typeof document.startViewTransition === "function")
	test.skip(!supported, "this engine has no document.startViewTransition")
	const shown = Promise.withResolvers<void>()
	await page.route(
		(url) => url.pathname === "/playground" && url.searchParams.get("_flare") === "data",
		async (route) => {
			await shown.promise
			await route.continue()
		},
	)
	await page.locator("#nav").getByRole("link", { name: "Playground" }).dispatchEvent("click")
	await page.waitForFunction(() => {
		const bar = document.querySelector("#progress")
		return bar !== null && getComputedStyle(bar).opacity === "1" && bar.getBoundingClientRect().width > 0
	})
	shown.resolve()
	await page.waitForFunction(() => Reflect.get(window, "__running") === true)
	await page.evaluate(() => {
		const sheet = new CSSStyleSheet()
		sheet.replaceSync("#progress{visibility:hidden!important}")
		document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
	})
	const strip = await page.screenshot({ clip: { x: 0, y: 0, width: 1261, height: 2 }, animations: "allow" })
	await page.evaluate(() => {
		for (const animation of document.getAnimations()) animation.finish()
	})
	await page.waitForFunction(() => Reflect.get(window, "__running") === false)
	await expect(page).toHaveURL(/\/playground$/)
	expect(await barPixels(strip), `${browserName}: no frozen bar in the transition`).toBe(0)
})
