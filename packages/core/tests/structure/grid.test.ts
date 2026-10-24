import { readdirSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { expect, it } from "vitest"
import { crashWatch, navigationLog, requestLog } from "../e2e/crash.ts"
import config from "../e2e/playwright.config.ts"
import { gridWorkers, memAvailable, RESERVE_BYTES, WORKER_PEAK_BYTES } from "../e2e/workers.ts"

// With no `--project`, the e2e config runs all 18 projects on any machine, Linux or macOS: the browsers come from the
// pinned image, so the OS does not choose them (B70, B97). Each project names its server and its engine. The 19th is
// the browser floor: the production client in Chromium with the APIs above the floor deleted, on the specs that drive
// the client (decision B123).
it("grid projects", () => {
	const projects = (config.projects ?? []).map((project) => [project.name, project.use?.browserName])
	const servers = ["node-dev", "node-prod", "bun-dev", "bun-prod", "workers-dev", "workers-prod"]
	expect(projects).toEqual([
		...servers.flatMap((server) =>
			(["chromium", "firefox", "webkit"] as const).map((engine) => [`${server}-${engine}`, engine]),
		),
		["node-prod-floor", "chromium"],
	])
	const floor = config.projects?.find((project) => project.name === "node-prod-floor")
	expect(floor?.use?.floor).toBe(true)
	expect(floor?.testMatch).toEqual(["docs-smoke.test.ts", "docs-navigation.test.ts", "docs-data.test.ts"])
	expect(config.projects?.filter((project) => project.use?.floor === true)).toHaveLength(1)
	expect(config.globalSetup).toBe("./global-setup.ts")
})

// The grid's workers fit the memory free at its start: min(half the cores, (MemAvailable − reserve) / one worker's
// measured peak), at least one; CI keeps Playwright's own count (BUGS.md 128).
it("grid workers", () => {
	const gb = 1e9
	expect(gridWorkers({ ci: false, cores: 16, available: 30 * gb })).toBe(8)
	expect(gridWorkers({ ci: false, cores: 16, available: 12 * gb })).toBe(
		Math.floor((12 * gb - RESERVE_BYTES) / WORKER_PEAK_BYTES),
	)
	expect(gridWorkers({ ci: false, cores: 16, available: 12 * gb })).toBe(3)
	expect(gridWorkers({ ci: false, cores: 16, available: 1 * gb })).toBe(1)
	expect(gridWorkers({ ci: false, cores: 4, available: 30 * gb })).toBe(2)
	expect(gridWorkers({ ci: true, cores: 16, available: 1 * gb })).toBeUndefined()
	expect(memAvailable("/nonexistent/meminfo")).toBeGreaterThan(0)
	expect(memAvailable()).toBeGreaterThan(0)
	expect(typeof config.workers).toBe(process.env["CI"] === undefined ? "number" : "undefined")
})

// A page that crashes fails the case that owned it: the watch covers the pages a context already has and every page
// it opens later, and its check names the crashed URL (plan 14 leaf 4.6).
it("crash fails", () => {
	type Listener = () => void
	const page = (url: string) => {
		const listeners: Listener[] = []
		return {
			on: (_event: "crash", listener: Listener) => listeners.push(listener),
			url: () => url,
			crash: () => listeners.forEach((run) => run()),
		}
	}
	const first = page("http://host/a")
	const opened: ((value: ReturnType<typeof page>) => void)[] = []
	const context = {
		pages: () => [first],
		on: (_event: "page", listener: (value: ReturnType<typeof page>) => void) => opened.push(listener),
	}
	const check = crashWatch(context)
	expect(check).not.toThrow()
	const later = page("http://host/b")
	for (const listener of opened) listener(later)
	later.crash()
	expect(check).toThrow("A page crashed: http://host/b")
	first.crash()
	expect(check).toThrow("A page crashed: http://host/b, http://host/a")
})

// A script request, failed with `failure` or not.
function script(failure: { errorText: string } | null) {
	return { url: () => "http://host/a.js", resourceType: () => "script", failure: () => failure }
}

// The navigation log records each page's main-frame navigations, not a child frame's, its document requests, not a
// script's, its failed requests, and its responses at 400 or above, for the pages a context has and opens later, each
// timed from the watch's start (BUGS.md 34.6, 121).
it("navigation log", () => {
	type Request = { url(): string; resourceType(): string; failure(): { errorText: string } | null }
	type Handlers = {
		framenavigated: ((frame: { url(): string; parentFrame(): unknown }) => void)[]
		request: ((request: Request) => void)[]
		requestfailed: ((request: Request) => void)[]
		response: ((response: { url(): string; status(): number }) => void)[]
	}
	const page = () => {
		const handlers: Handlers = { framenavigated: [], request: [], requestfailed: [], response: [] }
		return {
			handlers,
			on: (event: keyof Handlers, listener: never) => void handlers[event].push(listener),
		}
	}
	const first = page()
	const opened: ((value: ReturnType<typeof page>) => void)[] = []
	const context = {
		pages: () => [first],
		on: (_event: "page", listener: (value: ReturnType<typeof page>) => void) => void opened.push(listener),
	}
	let clock = 100
	const log = navigationLog(context, () => clock)
	clock = 112
	for (const run of first.handlers.framenavigated) run({ url: () => "http://host/", parentFrame: () => null })
	for (const run of first.handlers.framenavigated) run({ url: () => "http://host/frame", parentFrame: () => ({}) })
	for (const run of first.handlers.request) run(script(null))
	clock = 120
	for (const run of first.handlers.requestfailed) run(script({ errorText: "net::ERR_ABORTED" }))
	for (const run of first.handlers.requestfailed) run(script(null))
	for (const run of first.handlers.response) run({ url: () => "http://host/ok", status: () => 399 })
	for (const run of first.handlers.response) run({ url: () => "http://host/gone", status: () => 404 })
	const later = page()
	for (const listener of opened) listener(later)
	clock = 150
	for (const run of later.handlers.request)
		run({ url: () => "http://host/b", resourceType: () => "document", failure: () => null })
	expect(log()).toEqual([
		"12 framenavigated http://host/",
		"20 requestfailed http://host/a.js net::ERR_ABORTED",
		"20 requestfailed http://host/a.js ",
		"20 response 404 http://host/gone",
		"50 document http://host/b",
	])
})

// A failed case lists every request its pages started, the ones still in flight first, each with its type, its start,
// and how it ended, and, for one the server trace names by path, whether the server saw it arrive and answered it. A
// document the engine reported but the server never saw reads `server: not seen` (BUGS.md 453.5, 504.10).
type Listed = { url(): string; resourceType(): string; failure(): { errorText: string } | null }

function made(url: string, type: string, failure: string | null = null): Listed {
	return { url: () => url, resourceType: () => type, failure: () => (failure === null ? null : { errorText: failure }) }
}

it("request log", () => {
	type Request = Listed
	type Handlers = {
		request: ((request: Request) => void)[]
		response: ((response: { request(): Request; status(): number }) => void)[]
		requestfinished: ((request: Request) => void)[]
		requestfailed: ((request: Request) => void)[]
	}
	const handlers: Handlers = { request: [], response: [], requestfinished: [], requestfailed: [] }
	const page = { on: (event: keyof Handlers, listener: never) => void handlers[event].push(listener) }
	const context = { pages: () => [page], on: () => undefined }
	let clock = 0
	const log = requestLog(context, () => clock)
	const cdn = made("http://127.0.0.1:5000/app/cdn", "document")
	const mod = made("http://127.0.0.1:5000/src/a.ts?v=1", "script")
	const gone = made("http://127.0.0.1:5000/src/b.ts", "script", "cancelled")
	const again = made("http://127.0.0.1:5000/app/cdn", "document")
	clock = 10
	for (const run of handlers.request) run(cdn)
	clock = 12
	for (const run of handlers.response) run({ request: () => cdn, status: () => 200 })
	clock = 13
	for (const run of handlers.requestfinished) run(cdn)
	clock = 20
	for (const run of handlers.request) run(mod)
	for (const run of handlers.request) run(gone)
	clock = 25
	for (const run of handlers.requestfailed) run(gone)
	clock = 40
	for (const run of handlers.request) run(again)
	const server = [
		"== http://127.0.0.1:5000",
		"[trace] 2010 #1 GET /app/cdn arrived",
		"[trace] 2012 #1 GET /app/cdn finish 200 4488",
		"[trace] 2012 #1 GET /app/cdn close finished=true head=true bytes=4488",
		"[trace] 2020 #2 GET /src/a.ts?v=1 arrived",
	]
	expect(log(server)).toEqual([
		"in flight: 2 of 4 requests",
		"40 document http://127.0.0.1:5000/app/cdn in flight; server: not seen",
		"20 script http://127.0.0.1:5000/src/a.ts?v=1 in flight; server: #2 arrived, no answer",
		"10 document http://127.0.0.1:5000/app/cdn response 200 at 12, finished at 13; server: #1 arrived, answered 200",
		"20 script http://127.0.0.1:5000/src/b.ts failed (cancelled) at 25; server: not seen",
	])
})

// A spec's afterAll closes its boot only if the boot happened: when beforeAll fails (a killed vite run, a port taken), an
// unguarded `session.close()` adds a TypeError on top of the real failure (BUGS.md 119.17).
it("boot close guarded", () => {
	const dir = join(import.meta.dirname, "../e2e")
	const unguarded = readdirSync(dir)
		.filter((name) => name.endsWith(".test.ts"))
		.flatMap((name) => {
			const text = readFileSync(join(dir, name), "utf8")
			const hooks = [...text.matchAll(/afterAll\(([\s\S]*?)\n\s*\}\);|afterAll\(([^\n]*)\);/g)].map((match) => match[0])
			return hooks.flatMap((hook) =>
				[...hook.matchAll(/(\w+)\.close\(\)/g)].map((match) => `${name}: ${match[1]}.close()`),
			)
		})
	expect(unguarded).toEqual([])
})

// The e2e specs make HTTP calls with the `http` fixture, a connection per call (tests/e2e/http.ts). Playwright's
// `request` shares one keep-alive agent per worker process, and a socket one case left idle failed a later case's call
// with ECONNRESET when the server closed it (BUGS.md 125).
it("http client only", () => {
	const dir = join(import.meta.dirname, "../e2e")
	const users = readdirSync(dir)
		.filter((name) => name.endsWith(".test.ts"))
		.filter((name) => /async \(\{[^})]*\brequest\b[^})]*\}/.test(readFileSync(join(dir, name), "utf8")))
	expect(users).toEqual([])
})

// A glob of `*` wildcards, as both configs write them, as a whole-path pattern.
function globOf(pattern: string): RegExp {
	const parts = pattern.split("**/").map((part) =>
		part
			.split("*")
			.map((piece) => piece.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
			.join("[^/]*"),
	)
	return new RegExp(`^${parts.join("(?:.*/)?")}$`)
}

// Loaded by URL, read as data: the config is not part of the type-checked graph. Loaded at collection, so its module
// graph (Vite, the Solid plugin) never counts against a case's budget: under memory pressure that import alone once
// took past the 5 s unit timeout (BUGS.md 128.21).
const vitestConfig: unknown = Reflect.get(
	await import(new URL("../../vitest.config.ts", import.meta.url).href),
	"default",
)

// Every e2e file Playwright runs is excluded from vitest's node project, where Playwright's `test()` throws on import:
// a new spec missing there failed the unit gate, `test` (fe712263's prefetch-reuse.test.ts). The vitest files beside
// the specs, which Playwright ignores, stay in.
it("playwright specs outside vitest", async () => {
	const dir = join(import.meta.dirname, "../e2e")
	const ignored = [config.testIgnore ?? []].flat().map(String).map(globOf)
	const projects: unknown[] = Reflect.get(Object(Reflect.get(Object(vitestConfig), "test")), "projects") ?? []
	const node = projects.find(
		(project) => Reflect.get(Object(Reflect.get(Object(project), "test")), "name") === "unit-node",
	)
	const excluded: string[] = Reflect.get(Object(Reflect.get(Object(node), "test")), "exclude") ?? []
	const outside = (name: string) => excluded.some((pattern) => globOf(pattern).test(`tests/e2e/${name}`))
	const specs = readdirSync(dir).filter((name) => name.endsWith(".test.ts"))
	const playwright = specs.filter((name) => !ignored.some((glob) => glob.test(`tests/e2e/${name}`)))
	expect(playwright.filter((name) => !outside(name))).toEqual([])
	expect(specs.filter((name) => !playwright.includes(name) && outside(name))).toEqual([])
})

// The e2e runs and the hydrate harness serve Playwright's WebKit without COOP because revision 2370 hangs about 1 in
// 1250 concurrent navigations to a COOP document (bugs.webkit.org 325840, BUGS.md 504.12). Any other revision fails
// here until it is measured again: the probe at ~/.cache/flare-gates/probes/coop (repro.ts), 4000 navigations per arm
// with and without COOP, before the override is kept or dropped.
it("webkit coop revision", () => {
	const pkg = createRequire(import.meta.url).resolve("playwright-core/package.json")
	const listed: { browsers: { name: string; revision: string }[] } = JSON.parse(
		readFileSync(join(dirname(pkg), "browsers.json"), "utf8"),
	)
	const webkit = listed.browsers.find((browser) => browser.name === "webkit")?.revision
	expect(webkit, "Playwright's WebKit changed: rerun the COOP stress repro, 4000 per arm (BUGS.md 504.12)").toBe("2370")
})
