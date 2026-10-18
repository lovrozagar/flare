import { dirname, resolve } from "node:path"
import type { Page } from "@playwright/test"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { appFrom } from "./harness-app.ts"
import { ENGINES, startHarness, type Harness } from "./hydrate.harness.ts"

// dx/navigate.md's view transitions in each engine (B96): a real document `createServer(...).fetch` serves, hydrated
// by the real `createClient` under a router with view transitions on, its root in `ViewTransitionCSS` and its outlet
// in a `ViewTransitionBoundary`. Every start the browser is asked for is recorded with the names it saw.

let harness: Harness | undefined

beforeAll(async () => {
	harness = await startHarness(resolve(dirname(expect.getState().testPath ?? ""), "../.."))
})

afterAll(async () => {
	await harness?.close()
})

const TRANSITIONS = appFrom(`
const root = api.rootLayout.createRootLayout("_root_").render((props) => api.h("html", "doc", () => [
	api.h("head", "head", () => api.solid.createComponent(api.vtCss.ViewTransitionCSS, { duration: 50 })),
	api.h("body", "body", () => [
		api.h("header", "chrome", () => "chrome"),
		api.solid.createComponent(api.vtBoundary.ViewTransitionBoundary, {
			get children() { return api.h("main", "slot", () => props.children) },
		}),
	]),
]))
const Controls = () => {
	const navigate = api.outletNodes.useNavigate()
	if (typeof window !== "undefined") window.__flareNavigate = navigate
	return ""
}
const page = (route) => api.page.createPage(route).render(() => [api.h("p", "page", () => route.slice(6)), api.solid.createComponent(Controls, {})])
const routeTree = ["a", "b"].map((name) => ({ id: "_root_/" + name, path: "/" + name, module: page("_root_/" + name) }))
return { router: api.router.createRouter({ layouts: { _root_: root }, routeTree, viewTransitions: true, prefetch: false }) }
`)

// Each start: who started it, the form of its argument, its types, and the root's and the boundary's inline names as
// the start saw them; then the names once it finished.
async function watchStarts(tab: Page): Promise<void> {
	await tab.addInitScript(() => {
		const starts: unknown[] = []
		Reflect.set(window, "__flareStarts", starts)
		// Transitions started and not yet recorded, so a step waits for its own to finish instead of a fixed time.
		const open = { count: 0 }
		Reflect.set(window, "__flareOpen", open)
		// oxlint-disable-next-line unicorn/consistent-function-scoping -- the init script runs in the page, apart from this module
		const names = () => ({
			root: document.documentElement.style.viewTransitionName,
			boundary: document.getElementById("slot")?.style.viewTransitionName ?? "",
		})
		const wrap = (owner: object, key: string, who: string) => {
			const original = Reflect.get(owner, key) as ((this: unknown, arg: unknown) => ViewTransition) | undefined
			if (original === undefined) return
			Reflect.set(owner, key, function (this: unknown, arg: unknown) {
				const form = typeof arg === "function" ? "callback" : "object"
				const types = typeof arg === "object" && arg !== null ? Reflect.get(arg, "types") : undefined
				const start = { who, form, types, ...names() }
				const transition = original.call(this, arg)
				open.count += 1
				// Flare gives the names back on `finished` too, in its own callback: read them a task later.
				void transition.finished.then(() =>
					setTimeout(() => {
						starts.push({ ...start, after: names() })
						open.count -= 1
					}, 0),
				)
				return transition
			})
		}
		wrap(Document.prototype, "startViewTransition", "document")
		wrap(Element.prototype, "startViewTransition", "element")
	})
}

type Go = (options: unknown) => Promise<void>

// One navigation per option, each to the other page, waiting for its transition, if any, to finish and be recorded.
async function transitionSteps(tab: Page): Promise<void> {
	await tab.waitForFunction(() => typeof Reflect.get(window, "__flareNavigate") === "function")
	const supports = await tab.evaluate(() => ({
		document: "startViewTransition" in document,
		element: "startViewTransition" in Element.prototype,
		types: "ViewTransitionTypeSet" in window,
		css: document.querySelector("head style")?.textContent?.includes("animation-duration:50ms") === true,
	}))
	const options: (string | Record<string, unknown>)[] = [
		{},
		{ viewTransition: { scope: "document" } },
		{ viewTransition: { types: ["slide"] } },
		"types function",
		{ viewTransition: false },
		"types false",
		{ viewTransition: { scope: "auto" } },
	]
	const seen: unknown[] = []
	for (const [step, option] of options.entries()) {
		const to = step % 2 === 0 ? "_root_/b" : "_root_/a"
		const count = await tab.evaluate(() => (Reflect.get(window, "__flareStarts") as unknown[]).length)
		await tab.evaluate(
			async ([target, given]) => {
				const go = Reflect.get(window, "__flareNavigate") as Go
				const infos: unknown[] = []
				const viewTransition =
					given === "types function"
						? { types: (info: unknown) => (infos.push(info), ["by-info"]) }
						: given === "types false"
							? { types: () => false }
							: (given as { viewTransition?: unknown }).viewTransition
				await go(viewTransition === undefined ? { to: target } : { to: target, viewTransition })
				Reflect.set(window, "__flareInfos", infos)
			},
			[to, option] as const,
		)
		await tab.waitForFunction((at) => document.getElementById("page")?.textContent === at.slice(6), to)
		// The page changes inside the transition's update, so its start has been called by now: wait for it to finish. A
		// fixed 400 ms missed a 50 ms transition on CI's macOS runner.
		await tab.waitForFunction(() => (Reflect.get(window, "__flareOpen") as { count: number }).count === 0)
		const starts = await tab.evaluate((from) => (Reflect.get(window, "__flareStarts") as unknown[]).slice(from), count)
		const infos = await tab.evaluate(() => Reflect.get(window, "__flareInfos") as unknown[])
		seen.push(infos.length > 0 ? { starts, infos } : starts)
	}
	await tab.evaluate((all) => (Reflect.get(window, "__flareRecord") as unknown[]).push(all), { supports, seen })
}

type Supports = { document: boolean; element: boolean; types: boolean; css: boolean }

const cleared = { root: "", boundary: "" }

describe.each(ENGINES)("%s", (engine) => {
	// The default `"content"` scope names the root `none` and the boundary `flare-content`, then gives both back;
	// `"document"` names neither; `types` go in the object form where the browser has types, under the content scope's
	// names, a function of `info` too,
	// and `false` from it, like `viewTransition: false`, starts nothing; `"auto"` starts the boundary's own transition
	// where elements have one. `ViewTransitionCSS` writes the duration.
	it("view transitions", async () => {
		if (harness === undefined) throw new Error("the harness did not start")
		const result = await harness.app(engine, {
			app: TRANSITIONS,
			path: "/a",
			init: watchStarts,
			steps: transitionSteps,
			client() {},
		})
		expect(result.problems).toEqual([])
		const [{ supports, seen }] = result.record as [{ supports: Supports; seen: unknown[] }]
		expect(supports.css).toBe(true)
		const start = (fields: Record<string, unknown>) =>
			supports.document ? [{ who: "document", form: "callback", types: undefined, after: cleared, ...fields }] : []
		const content = { root: "none", boundary: "flare-content" }
		const typed = (types: string[]) => start(supports.types ? { form: "object", types, ...content } : content)
		const forward = { direction: "forward", pathChanged: true }
		expect(seen).toEqual([
			start(content),
			start({ root: "", boundary: "" }),
			typed(["slide"]),
			{
				starts: typed(["by-info"]),
				infos: [
					{
						...forward,
						fromLocation: { pathname: "/b", search: "", hash: "" },
						toLocation: { pathname: "/a", search: "", hash: "" },
					},
				],
			},
			[],
			[],
			supports.element
				? [{ who: "element", form: "callback", types: undefined, root: "", boundary: "", after: cleared }]
				: start({ root: "", boundary: "" }),
		])
	})
})
