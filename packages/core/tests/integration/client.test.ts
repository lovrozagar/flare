import { dirname, resolve } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { ENGINES, startHarness, type Api, type AppResult, type Engine, type Harness } from "./hydrate.harness.ts"

// createClient through the browser harness (B96, dx/client.md): a document the real `createServer(...).fetch` serves
// is hydrated in every engine by the real `createClient`, whose callbacks write into the page's record. The callbacks
// and the app are compiled into the page from their source, so they read only their arguments. One harness boot serves
// the file.
let harness: Harness | undefined

beforeAll(async () => {
	harness = await startHarness(resolve(dirname(expect.getState().testPath ?? ""), "../.."))
})

afterAll(async () => {
	await harness?.close()
})

function started(): Harness {
	if (harness === undefined) throw new Error("the harness did not start")
	return harness
}

// A root that renders its child and one page, built on both sides from this source.
function app(api: Api): { router: unknown } {
	const root = api.rootLayout.createRootLayout("_root_").render((props) => props.children)
	const home = api.page.createPage("_root_/").render(() => "home")
	const routeTree = [{ id: "_root_/", path: "/", module: home }]
	return { router: api.router.createRouter({ layouts: { _root_: root }, routeTree }) }
}

// onReady runs once the router context exists and before hydrate commits, with only `{ navigate, location }`; a second
// onReady runs after the first; onHydrated runs after, with `data-flare-hydrated` already on `<html>`.
function readyThenHydrated(engine: Engine): Promise<AppResult> {
	return started().app(engine, {
		app,
		path: "/?q=1#top",
		client(client, record) {
			client
				.onReady((ctx) =>
					record.push({
						ready: Object.keys(ctx).toSorted(),
						location: ctx.location,
						marked: document.documentElement.hasAttribute("data-flare-hydrated"),
					}),
				)
				.onReady(() => record.push("second ready"))
				.onHydrated(() => record.push({ hydrated: document.documentElement.hasAttribute("data-flare-hydrated") }))
		},
	})
}

// onIdle runs after hydrate, once the browser idles or a second has passed.
function idleAfterHydrated(engine: Engine): Promise<AppResult> {
	return started().app(engine, {
		app,
		client(client, record) {
			client.onIdle(() => record.push("idle")).onHydrated(() => record.push("hydrated"))
		},
		async steps(tab) {
			await tab.waitForFunction(() => (Reflect.get(window, "__flareRecord") as unknown[]).includes("idle"))
		},
	})
}

// onInteraction runs once, on the first `pointerdown` or `keydown`, and not for a programmatic navigation.
async function interactionOnce(engine: Engine): Promise<{ result: AppResult; beforeInput: unknown[] }> {
	let beforeInput: unknown[] = []
	const result = await started().app(engine, {
		app,
		client(client, record) {
			client
				.onReady((ctx) => Reflect.set(window, "flareNavigate", ctx.navigate))
				.onInteraction(() => record.push("interaction"))
		},
		async steps(tab) {
			await tab.evaluate(async () => {
				const go = Reflect.get(window, "flareNavigate") as (options: { to: string }) => Promise<void>
				await go({ to: "_root_/" })
			})
			beforeInput = await tab.evaluate(() => [...(Reflect.get(window, "__flareRecord") as unknown[])])
			await tab.mouse.click(10, 10)
			await tab.keyboard.press("a")
			await tab.mouse.click(20, 20)
		},
	})
	return { result, beforeInput }
}

// A callback registered after the hydrate microtask throws (`late`).
function lateRegistration(engine: Engine): Promise<AppResult> {
	return started().app(engine, {
		app,
		client(client, record) {
			setTimeout(() => {
				try {
					client.onReady(() => undefined)
					record.push("accepted")
				} catch (error) {
					record.push(error instanceof Error ? error.message : String(error))
				}
			}, 0)
		},
		async steps(tab) {
			await tab.waitForFunction(() => (Reflect.get(window, "__flareRecord") as unknown[]).length > 0)
		},
	})
}

// Storage blocked, as with cookies off or in a sandboxed iframe: reading `window.sessionStorage` throws. The page still
// hydrates and navigates; scroll restore and the reload guard go without (plan 21 3.6).
function storageBlocked(engine: Engine): Promise<AppResult> {
	return started().app(engine, {
		app,
		async init(tab) {
			await tab.addInitScript(() => {
				Object.defineProperty(window, "sessionStorage", {
					get() {
						throw new DOMException("The operation is insecure.", "SecurityError")
					},
				})
			})
		},
		client(client, record) {
			client
				.onReady((ctx) => Reflect.set(window, "flareNavigate", ctx.navigate))
				.onHydrated(() => record.push("hydrated"))
		},
		async steps(tab) {
			await tab.waitForFunction(() => (Reflect.get(window, "__flareRecord") as unknown[]).includes("hydrated"))
			await tab.evaluate(async () => {
				const go = Reflect.get(window, "flareNavigate") as (options: { to: string; search: object }) => Promise<void>
				await go({ to: "_root_/", search: { q: "2" } })
				;(Reflect.get(window, "__flareRecord") as unknown[]).push(location.search)
			})
		},
	})
}

// A page whose blocker refuses: leaving the document, by reload, tab close, or a link that loads a document, asks
// first, so the `beforeunload` the browser fires is cancelled. Without a blocker it is not (plan 21 3.5). The app is
// source the harness compiles for each side, so `?block` picks the case.
function blockerUnload(engine: Engine, refuse: boolean): Promise<AppResult> {
	return started().app(engine, {
		path: refuse ? "/?block" : "/",
		app: (api) => {
			const root = api.rootLayout.createRootLayout("_root_").render((props) => props.children)
			const home = api.page.createPage("_root_/").render(() => {
				if (typeof window !== "undefined" && location.search === "?block") api.blocker.useBlocker(() => false)
				return "home"
			})
			const routeTree = [{ id: "_root_/", path: "/", module: home }]
			return { router: api.router.createRouter({ layouts: { _root_: root }, routeTree }) }
		},
		client(client, record) {
			client.onHydrated(() => record.push("hydrated"))
		},
		async steps(tab) {
			await tab.waitForFunction(() => (Reflect.get(window, "__flareRecord") as unknown[]).includes("hydrated"))
			await tab.evaluate(() => {
				const event = new Event("beforeunload", { cancelable: true })
				window.dispatchEvent(event)
				;(Reflect.get(window, "__flareRecord") as unknown[]).push(event.defaultPrevented)
			})
		},
	})
}

describe.each(ENGINES)("%s", (engine) => {
	it("blocker unload", async () => {
		const [blocked, free] = [await blockerUnload(engine, true), await blockerUnload(engine, false)]
		expect([blocked.problems, free.problems]).toEqual([[], []])
		expect([blocked.record, free.record]).toEqual([
			["hydrated", true],
			["hydrated", false],
		])
	})
	it("storage blocked", async () => {
		const result = await storageBlocked(engine)
		expect(result.problems).toEqual([])
		expect(result.record).toEqual(["hydrated", "?q=2"])
	})
	it("ready then hydrated", async () => {
		const result = await readyThenHydrated(engine)
		expect(result.problems).toEqual([])
		expect(result.record).toEqual([
			{ ready: ["location", "navigate"], location: { pathname: "/", search: "?q=1", hash: "#top" }, marked: false },
			"second ready",
			{ hydrated: true },
		])
	})
	it("idle after hydrated", async () => {
		const result = await idleAfterHydrated(engine)
		expect(result.problems).toEqual([])
		expect(result.record).toEqual(["hydrated", "idle"])
	})
	it("interaction once", async () => {
		const { result, beforeInput } = await interactionOnce(engine)
		expect(beforeInput).toEqual([])
		expect(result.problems).toEqual([])
		expect(result.record).toEqual(["interaction"])
	})
	it("late registration", async () => {
		const result = await lateRegistration(engine)
		expect(result.record).toHaveLength(1)
		expect(result.record[0]).not.toBe("accepted")
	})
})
