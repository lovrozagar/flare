import type { Page } from "@playwright/test"
import { expect, isProd, open, test } from "./docs.fixture.ts"

// The seeded browser chaos run (plan 21 17.1): a session of random steps over the docs app, a click on one of the
// page's own links, Back, Forward, or a reload, chosen by a seeded generator, so a failing run names the seed that
// replays it. After every step the page is hydrated and shows content, never a blank screen; at the end no step left
// an error, and in Chromium the pages left behind were collected. The gate runs 40 steps from one seed;
// FLARE_CHAOS_STEPS and FLARE_CHAOS_SEED run a long form, as a nightly job does.
const STEPS = Number(process.env["FLARE_CHAOS_STEPS"] ?? 40)
const SEED = Number(process.env["FLARE_CHAOS_SEED"] ?? 20_261_017)

// mulberry32: a small seeded generator, the same sequence for the same seed on every machine.
function generator(seed: number): () => number {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
		mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296
	}
}

// The docs app's links to what is not a page, each with its reason: the runner steps on pages only.
const NOT_PAGES = [
	// The `mount("/healthz")` demo answers JSON from outside the router: a browser shows the text, with no app to hydrate.
	"/healthz",
]

// The error answers the docs app gives on purpose, each with its reason: any other answer of 400 or more fails the run.
const ON_PURPOSE = [
	// The `_admin_` root answers a visitor who has not signed in with its sign-in page, status 401.
	"401 /admin",
]

// Whether a problem is the browser's log of an answer in ON_PURPOSE: Chromium logs every error answer it loads.
function onPurpose(problem: string): boolean {
	const [, status, url] = /status of (\d+) \(.*\) at (\S+)$/.exec(problem) ?? []
	return url !== undefined && ON_PURPOSE.includes(`${status} ${new URL(url).pathname}`)
}

// Clicks one of the page's own visible links a visitor can follow, chosen by `pick` in [0, 1): same origin, no new
// tab, no download, no fragment, no file, none of NOT_PAGES. The href it followed, or none when the page shows no
// such link.
function clickLink(page: Page, pick: number): Promise<string | undefined> {
	return page.evaluate(
		({ at, skip }) => {
			const visible = [...document.querySelectorAll<HTMLAnchorElement>("a[href^='/']")].filter((link) => {
				const href = link.getAttribute("href") ?? ""
				const box = link.getBoundingClientRect()
				// A file the app serves, `/sitemap.xml` or `/llms.txt`, is no page to step on.
				const path = href.split("?")[0] ?? ""
				const page = !/\.[a-z0-9]+$/i.test(path) && !skip.includes(path)
				const followable = page && link.target === "" && !link.hasAttribute("download") && !href.includes("#")
				return followable && !href.startsWith("/_flare") && box.width > 0 && box.height > 0
			})
			const link = visible[Math.floor(at * visible.length)]
			link?.click()
			const where = link?.closest("[id]")?.id ?? "page"
			return link === undefined ? undefined : `${link.getAttribute("href") ?? ""}@${where}`
		},
		{ at: pick, skip: NOT_PAGES },
	)
}

// One step, by its draw: mostly a click, sometimes Back, Forward, or a reload. Back stays within the session: flare's
// history index says how many of its entries lie behind, so it never leaves for the blank page before the first.
async function step(page: Page, draw: () => number): Promise<string> {
	const roll = draw()
	const behind = await page.evaluate(() => Number(Reflect.get(Object(history.state), "index") ?? 0))
	if (roll < 0.15 && behind > 0) {
		await page.goBack({ waitUntil: "commit" })
		return "back"
	}
	if (roll < 0.25) {
		await page.goForward({ waitUntil: "commit" })
		return "forward"
	}
	if (roll < 0.3) {
		await page.reload()
		return "reload"
	}
	const from = new URL(page.url()).pathname
	return `click ${(await clickLink(page, draw())) ?? "none"} from ${from}`
}

// The page's data and prefetch requests in flight, so a step waits for its navigation to land. A document load, a
// reload during a Back's data request say, ends the page it leaves and that page's requests, which Chromium then
// reports neither finished nor failed.
function inFlight(page: Page): Set<string> {
	const open = new Set<string>()
	page.on("request", (request) => {
		if (request.isNavigationRequest() && request.frame() === page.mainFrame()) open.clear()
		else if (request.url().includes("_flare=")) open.add(request.url())
	})
	page.on("requestfinished", (request) => void open.delete(request.url()))
	page.on("requestfailed", (request) => void open.delete(request.url()))
	return open
}

// A page shows content once its step landed: the clicked path reached, no data request in flight, hydrated, and the
// root layout's page slot (`#app`, or `#admin-app` in the `_admin_` root) holding text, never a blank screen. `trail`
// names the steps so far.
async function shows(page: Page, at: { trail: readonly string[]; open: Set<string> }): Promise<void> {
	const last = at.trail.at(-1) ?? ""
	const message = () => `${page.url()} after ${at.trail.join(", ")}`
	// A click to another page lands once the URL leaves the page it started on; a redirect, such as a legacy path's,
	// lands wherever it points.
	const [, to, from] = /^click ([^@\s]+)@\S+ from (\S+)$/.exec(last) ?? []
	if (to !== undefined && from !== undefined && to.split("?")[0] !== from) {
		await expect.poll(() => new URL(page.url()).pathname, { message: message() }).not.toBe(from)
	}
	await expect
		.poll(() => at.open.size)
		.toBe(0)
		.catch(() => {
			throw new Error(`${[...at.open].join(" ")} still open at ${message()}`)
		})
	await page
		.locator("html[data-flare-hydrated]")
		.waitFor({ state: "attached", timeout: 10_000 })
		.catch(() => {
			throw new Error(`not hydrated at ${message()}`)
		})
	const text = () => page.evaluate(() => (document.querySelector("#app, #admin-app")?.textContent ?? "").trim().length)
	await expect.poll(text, { message: `blank ${message()}` }).toBeGreaterThan(0)
}

async function liveElements(page: Page): Promise<number> {
	const cdp = await page.context().newCDPSession(page)
	await cdp.send("HeapProfiler.enable")
	await cdp.send("HeapProfiler.collectGarbage")
	const prototype = await cdp.send("Runtime.evaluate", { expression: "HTMLElement.prototype" })
	const found = await cdp.send("Runtime.queryObjects", { prototypeObjectId: prototype.result.objectId ?? "" })
	const length = await cdp.send("Runtime.callFunctionOn", {
		objectId: found.objects.objectId ?? "",
		functionDeclaration: "function () { return this.length }",
		returnByValue: true,
	})
	await cdp.detach()
	return Number(length.result.value)
}

test("seeded chaos", async ({ page, docs, browserName }, info) => {
	test.skip(!isProd(info), "the production build")
	test.setTimeout(STEPS * 5_000 + 60_000)
	const flying = inFlight(page)
	// Every answer of 400 or more the docs app does not give on purpose, with its URL.
	const failed: string[] = []
	page.on("response", (response) => {
		const answer = `${response.status()} ${new URL(response.url()).pathname}`
		if (response.status() >= 400 && !ON_PURPOSE.includes(answer)) failed.push(`${answer} ${response.url()}`)
	})
	const problems = await open(page, docs.origin, "/")
	const draw = generator(SEED)
	const trail: string[] = []
	const chromium = browserName === "chromium"
	let early = 0
	for (let index = 0; index < STEPS; index++) {
		trail.push(await step(page, draw))
		await shows(page, { trail, open: flying })
		if (chromium && index === 9) early = await liveElements(page)
	}
	const seen = `seed ${SEED}: ${trail.join(", ")}`
	expect({ failed, problems: problems.filter((problem) => !onPurpose(problem)) }, seen).toEqual({
		failed: [],
		problems: [],
	})
	if (chromium) expect(await liveElements(page), seen).toBeLessThanOrEqual(early * 1.5 + 200)
})
