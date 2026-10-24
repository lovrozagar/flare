import { writeFileSync } from "node:fs"
import type { Page, TestInfo } from "@playwright/test"
import sharp from "sharp"
import { background, paintedFraction } from "../black-box/painted.ts"
import { generator, replayLine, runFrom } from "../black-box/seeded.ts"
import { leftBehind, moduleFailed, type StepEvent } from "../black-box/unload.ts"
import { expect, isProd, open, test } from "./docs.fixture.ts"

// The seeded browser chaos run (plan 21 17.1): a session of random steps over the docs app, a click on one of the
// page's own links, Back, Forward, or a reload, chosen by the black-box suites' seeded generator, so a failing run names
// the seed and the command that replay it. After every step the page is hydrated and shows content, never a blank
// screen; at the end no step left an error, and in Chromium the pages left behind were collected. The gate runs 40
// steps from one seed; FLARE_CHAOS_SEED and FLARE_CHAOS_STEPS pick a run, and FLARE_BLACKBOX_LONG=1 runs the nightly's
// long form, 400 steps from the night's date.
const RUN = runFrom(process.env, { name: "CHAOS", seed: 20_261_017, steps: 40, longSteps: 400 })
const LONG = process.env["FLARE_BLACKBOX_LONG"] === "1"

// The gate's projects: Chromium on Node and workerd, Firefox and WebKit on Node. The long form, or a run that names its
// projects, runs every production project.
const GATE = new Set(["node-prod-chromium", "workers-prod-chromium", "node-prod-firefox", "node-prod-webkit"])
const CHOSEN = process.env["FLARE_E2E_PROJECTS_CHOSEN"] === "1"

// The share of the viewport under which a page shows nothing, whatever text its DOM holds. The sparsest docs page,
// `/admin`'s sign-in, paints 0.0065 in Chromium; a blank one paints 0 (the long form's Back, 2026-10-22). A third of
// the sparsest, in every engine.
const PAINTED_FLOOR = 0.002

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

// Firefox's loaded fonts are shared by every context of one browser, which the runner reuses across a worker's tests: a
// later context resolves the docs app's fonts from that cache and never uses its own preload, and Firefox warns. Probed
// 2026-10-22: a fresh load, a client navigation, and a reload warn nothing; a fresh context warns for both fonts. A
// visitor's single tab never meets it.
const SHARED_FONT_CACHE = /preloaded with link preload was not used within a few seconds/

// Whether a problem is the browser's log of an answer in ON_PURPOSE (Chromium logs every error answer it loads), or
// Firefox's shared font cache.
function onPurpose(problem: string): boolean {
	if (SHARED_FONT_CACHE.test(problem)) return true
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

// The share of the viewport painted apart from the page's background color (painted.ts).
async function painted(page: Page): Promise<{ share: number; shot: Buffer }> {
	const computed = await page.evaluate(() => {
		const body = getComputedStyle(document.body).backgroundColor
		return /^rgba\(0, 0, 0, 0\)$|^transparent$/.test(body)
			? getComputedStyle(document.documentElement).backgroundColor
			: body
	})
	// caret "initial": the default hides the caret with an injected stylesheet, which the docs app's CSP refuses, and
	// WebKit logs the refusal as an error.
	const shot = await page.screenshot({ type: "png", caret: "initial" })
	const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true })
	return { share: paintedFraction(data, { channels: info.channels, base: background(computed) }), shot }
}

// The painted share and its screenshot. WebKit's screenshot applies a stylesheet of Playwright's own, which the docs
// app's CSP refuses and WebKit logs; a refusal logged during the screenshot itself is that, set aside. Any other
// moment's still fails the run.
async function screen(page: Page, problems: string[]): Promise<{ share: number; shot: Buffer }> {
	const before = problems.length
	const seen = await painted(page)
	const during = problems.splice(before)
	problems.push(...during.filter((problem) => !/Refused to apply a stylesheet/.test(problem)))
	return seen
}

// A blank first screenshot taken again once the page settled, two frames and a second later: under load the first can
// come before the new page's first paint, the DOM already hydrated (each blank the long form saw, Chromium with nine
// projects at once, none in nine replays alone). A blank page stays blank: its share then, with both frames and the
// page's state kept as files (the line reporter keeps a body attachment in the report only). Undefined once painted.
async function settledBlank(
	page: Page,
	at: { problems: string[]; info: TestInfo; first: Buffer },
): Promise<number | undefined> {
	await page.evaluate(
		() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined)))),
	)
	await page.waitForTimeout(1000)
	const settled = await screen(page, at.problems)
	if (settled.share > PAINTED_FLOOR) return undefined
	const where = await page.evaluate(() => ({
		scrollY: window.scrollY,
		height: document.documentElement.scrollHeight,
		text: document.body.innerText.slice(0, 200),
	}))
	const files: [string, string | Buffer, string][] = [
		["blank-first.png", at.first, "image/png"],
		["blank-settled.png", settled.shot, "image/png"],
		["blank-page-state.json", JSON.stringify(where, undefined, 2), "application/json"],
	]
	for (const [name, body, contentType] of files) {
		const path = at.info.outputPath(name)
		writeFileSync(path, body)
		await at.info.attach(name, { path, contentType })
	}
	return settled.share
}

// Chromium's live DOM nodes and JS event listeners after a GC: a detached subtree something still holds counts every
// node in it, and a listener never removed counts until it is (CDP Memory.getDOMCounters).
async function domCounters(page: Page): Promise<{ nodes: number; listeners: number }> {
	const cdp = await page.context().newCDPSession(page)
	await cdp.send("HeapProfiler.enable")
	await cdp.send("HeapProfiler.collectGarbage")
	const counters = await cdp.send("Memory.getDOMCounters")
	await cdp.detach()
	return { nodes: counters.nodes, listeners: counters.jsEventListeners }
}

// What the leaving page's teardown is told from (black-box/unload.ts, BUGS.md 518): every request the page made,
// main-frame document navigations and their commits, kept for the whole run, since a module the old page asked for
// can come steps before the navigation; and each step's Firefox module warnings, emptied at each step so they line up
// with that step's problems.
function stepEvents(page: Page): { history: StepEvent[]; warnings: StepEvent[] } {
	const history: StepEvent[] = []
	const warnings: StepEvent[] = []
	page.on("request", (request) => {
		history.push({ at: Date.now(), kind: "request", url: request.url() })
		if (request.resourceType() === "document" && request.frame() === page.mainFrame())
			history.push({ at: Date.now(), kind: "document" })
	})
	page.on("framenavigated", (frame) => {
		if (frame === page.mainFrame()) history.push({ at: Date.now(), kind: "commit" })
	})
	page.on("console", (message) => {
		const url = moduleFailed(message.text())
		if (url !== undefined) warnings.push({ at: Date.now(), kind: "warning", url })
	})
	return { history, warnings }
}

test("seeded chaos", async ({ page, docs, browserName }, info) => {
	test.skip(!isProd(info), "the production build")
	test.skip(!LONG && !CHOSEN && !GATE.has(info.project.name), "the gate's four projects; the nightly runs all")
	test.setTimeout(RUN.steps * 5_000 + 60_000)
	const flying = inFlight(page)
	// Every answer of 400 or more the docs app does not give on purpose, with its URL.
	const failed: string[] = []
	page.on("response", (response) => {
		const answer = `${response.status()} ${new URL(response.url()).pathname}`
		if (response.status() >= 400 && !ON_PURPOSE.includes(answer)) failed.push(`${answer} ${response.url()}`)
	})
	const events = stepEvents(page)
	const problems = await open(page, docs.origin, "/")
	const draw = generator(RUN.seed)
	const trail: string[] = []
	const chromium = browserName === "chromium"
	const replay = replayLine(RUN, {
		name: "CHAOS",
		command: `bun run test:e2e -- --project=${info.project.name} docs-chaos`,
	})
	let early = { nodes: 0, listeners: 0 }
	let least = 1
	for (let index = 0; index < RUN.steps; index++) {
		const before = problems.length
		events.warnings.length = 0
		trail.push(await step(page, draw))
		await shows(page, { trail, open: flying }).catch((error: unknown) => {
			throw new Error(`${replay}\n${String(error)}`)
		})
		const { share, shot } = await screen(page, problems)
		problems.push(...leftBehind(problems.splice(before), [...events.history, ...events.warnings]))
		least = Math.min(least, share)
		const blank = share > PAINTED_FLOOR ? undefined : await settledBlank(page, { problems, info, first: shot })
		if (blank !== undefined) {
			throw new Error(
				`${replay}\nvisibly blank (${blank} of the viewport painted, settled) at ${page.url()} after ${trail.join(", ")}`,
			)
		}
		if (chromium && index === 9) early = await domCounters(page)
	}
	if (process.env["FLARE_CHAOS_OBSERVE"] === "1") console.log(`CHAOS-PAINTED ${browserName} ${least}`)
	const seen = `${replay}: ${trail.join(", ")}`
	expect({ failed, problems: problems.filter((problem) => !onPurpose(problem)) }, seen).toEqual({
		failed: [],
		problems: [],
	})
	// Past step 10 the page holds what any one page needs: half again its count plus some slack, a leak's growth not.
	if (chromium) {
		const late = await domCounters(page)
		expect({ ...late, seen }).toEqual({
			nodes: late.nodes <= early.nodes * 1.5 + 200 ? late.nodes : `at most ${early.nodes * 1.5 + 200}`,
			listeners:
				late.listeners <= early.listeners * 1.5 + 20 ? late.listeners : `at most ${early.listeners * 1.5 + 20}`,
			seen,
		})
	}
})
