import { spawn, type ChildProcess } from "node:child_process"
import { dirname, resolve } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { ENGINES, startHarness, type Api, type Harness, type Side } from "./hydrate.harness.ts"

// A server render hydrated by the client build in a real browser, in every engine (bits/15). Solid's hydration
// messages are the failure. Each tree is compiled into both sides from its source, so it reads only `api` and `side`.
// Unset when the harness could not start: its own error is the failure, and there is nothing to close.
let harness: Harness | undefined

// Another process holds Vite's default HMR port, 24678, and closes every socket it accepts, as a foreign dev server
// can, from before the harness starts to the end of the file: a Vite that has not bound the port itself sends its
// client there (BUGS.md B53). It is a child process, so it closes each socket at once. A port another process already
// holds is the same condition.
const SQUAT =
	'const server = require("node:net").createServer((socket) => socket.destroy());' +
	'server.on("error", () => console.log("held"));' +
	'server.listen(24678, "0.0.0.0", () => console.log("ready"));'
let squat: ChildProcess | undefined

beforeAll(async () => {
	const child = spawn(process.execPath, ["-e", SQUAT], { stdio: ["ignore", "pipe", "inherit"] })
	squat = child
	await new Promise<void>((done) => child.stdout?.once("data", () => done()))
	// packages/core, two levels above this file, whatever directory the run started in.
	harness = await startHarness(resolve(dirname(expect.getState().testPath ?? ""), "../.."))
})

afterAll(async () => {
	await harness?.close()
	squat?.kill()
})

function started(): Harness {
	if (harness === undefined) throw new Error("the hydrate harness did not start")
	return harness
}

// A client tree with one more element than the server's.
function mismatched(api: Api, side: Side) {
	return side === "server" ? [api.h("div", "one")] : [api.h("p", "extra"), api.h("div", "one")]
}

// The progress hook in a component, then a sibling element.
function progressBeside(api: Api) {
	function Bar() {
		const progress = api.progress.useNavigationProgress()
		return api.h("div", "bar", () => String(progress.value))
	}
	return [api.solid.createComponent(Bar, {}), api.h("div", "sibling", () => "after")]
}

// A root with its boundary renders declared, a progress bar, and a page that does not fail.
function idleBoundaries(api: Api) {
	function Bar() {
		const progress = api.progress.useNavigationProgress()
		return api.h("div", "bar", () => String(progress.value))
	}
	const root = api.rootLayout
		.createRootLayout("_root_")
		.render((props) => [api.solid.createComponent(Bar, {}), api.h("main", "main", () => props.children)])
		.errorRender(() => api.h("h1", "root-error", () => "broke"))
		.notFoundRender(() => api.h("h1", "root-missing", () => "missing"))
	const home = api.page.createPage("_root_/").render(() => "home")
	const matches = [
		{ id: "_root_", kind: "layout", module: root, params: {}, search: {}, data: null },
		{ id: "_root_/", kind: "page", module: home, params: {}, search: {}, data: null },
	] as const
	return api.solid.createComponent(api.outlet.Matches, {
		state: () => ({ matches: [...matches], onBoundaryError: () => undefined }),
	})
}

// A page whose component calls the five data hooks in its body, under the router's reactive match state.
function dataHooks(api: Api) {
	const from = "_root_/users/[id]"
	function Hooks() {
		const params = api.outletNodes.useParams({ from })
		const search = api.outletNodes.useSearch({ from })
		const data = api.outletNodes.useLoaderData({ from })
		const context = api.outletNodes.usePreloaderContext({ from })
		const match = api.outletNodes.useMatch({ from })
		return api.h("p", "hooks", () =>
			[
				Reflect.get(Object(params), "id"),
				Reflect.get(Object(search), "tab"),
				Reflect.get(Object(data), "name"),
				Reflect.get(Object(context), "role"),
				match.routeId,
			].join(","),
		)
	}
	const root = api.rootLayout.createRootLayout("_root_").render((props) => props.children)
	const page = api.page.createPage(from).render(() => api.solid.createComponent(Hooks, {}))
	const user = { params: { id: "7" }, search: { tab: "a" }, data: { name: "ada" }, preloader: { role: "admin" } }
	const matches = [
		{ id: "_root_", kind: "layout", module: root, params: {}, search: {}, data: null },
		{ id: from, kind: "page", module: page, ...user },
	] as const
	const [state] = api.solid.createSignal({ matches: [...matches], onBoundaryError: () => undefined })
	const routes = api.router.createRouter({
		layouts: { _root_: root },
		routeTree: [{ id: from, path: "/users/[id]", module: page }],
	})
	return api.solid.createComponent(api.routerContext.RouterContext, {
		value: routes,
		get children() {
			return api.solid.createComponent(api.routerContext.LocationContext, {
				value: () => ({ pathname: "/users/7", search: "?tab=a", hash: "" }),
				get children() {
					return api.solid.createComponent(api.outlet.Matches, { state })
				},
			})
		},
	})
}

describe.each(ENGINES)("%s", { timeout: 30_000 }, (engine) => {
	// The harness is not vacuous: a mismatched tree fails it.
	it("harness bites", async () => {
		expect((await started().hydrate(engine, mismatched)).problems).not.toEqual([])
	})

	// useNavigationProgress creates the same owners on both sides, so a sibling after it keeps its key (BUGS.md B2).
	it("navigation progress beside a sibling", async () => {
		const result = await started().hydrate(engine, progressBeside)
		expect(result.problems).toEqual([])
		expect(result.text).toBe("nullafter")
	})

	// A root that declares its boundary renders and does not fail creates none of them at hydrate (BUGS.md B3).
	it("root boundaries idle", async () => {
		const result = await started().hydrate(engine, idleBoundaries)
		expect(result.problems).toEqual([])
		expect(result.html).not.toContain("root-error")
		expect(result.text).toBe("nullhome")
	})

	// Each data hook called in a component body reads the store once, untracked by design (BUGS.md B4).
	it("data hooks read untracked", async () => {
		const result = await started().hydrate(engine, dataHooks)
		expect(result.problems).toEqual([])
		expect(result.text).toBe("7,a,ada,admin,_root_/users/[id]")
	})
})

// With the port held from before the harness started, the page's Vite client still talks to the harness's own server,
// so no case sees the foreign socket (BUGS.md B53).
it("foreign hmr port", { timeout: 30_000 }, async () => {
	const problems: string[] = []
	for (const tree of [progressBeside, idleBoundaries, dataHooks])
		problems.push(...(await started().hydrate("chromium", tree)).problems)
	expect(problems).toEqual([])
})
