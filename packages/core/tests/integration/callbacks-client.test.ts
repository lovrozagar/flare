import { dirname, resolve } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { appFrom } from "./harness-app.ts"
import { ENGINES, startHarness, type Harness } from "./hydrate.harness.ts"

// An app callback that throws in the browser is the app's bug, never the end of the boot: a throwing `onReady`,
// `onHydrated`, or page `shouldRefetch` is logged, and the page still hydrates, runs its other callbacks, and fills
// a stored page's hole (plan 21 9.3, BUGS.md 203). The real createServer and createClient, through the hydrate harness.

let harness: Harness | undefined

beforeAll(async () => {
	harness = await startHarness(resolve(dirname(expect.getState().testPath ?? ""), "../.."))
})

afterAll(async () => {
	await harness?.close()
})

const APP = appFrom(`
const root = api.rootLayout.createRootLayout("_root_").render((props) => api.h("html", "doc", () => [
	api.h("head", "head"),
	api.h("body", "body", () => api.h("main", "slot", () => props.children)),
]))
const holed = api.page.createPage("_root_/holed")
	.cache({ isr: { defer: "stream" } })
	.effects({ shouldRefetch: () => { throw new Error("refetch boom") } })
	.loader(({ defer }) => ({ late: defer(() => new Promise((resolve) => setTimeout(() => resolve("filled"), 20))) }))
	.render((props) => {
		const late = api.deferred.useDeferred(() => props.loaderData.late)
		return api.h("p", "holed", () => api.solid.createComponent(api.solid.Loading, { fallback: "wait", get children() { return late() } }))
	})
return {
	router: api.router.createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/holed", path: "/holed", module: holed }] }),
	server: { store: api.memory.createMemoryStore() },
}
`)

describe.each(ENGINES)("%s", (engine) => {
	it("throwing callbacks", async () => {
		if (harness === undefined) throw new Error("the harness did not start")
		const result = await harness.app(engine, {
			app: APP,
			path: "/holed",
			prime: [{ path: "/holed" }],
			client(client, record) {
				client
					.onReady(() => {
						throw new Error("ready boom")
					})
					.onReady(() => record.push("ready"))
					.onHydrated(() => {
						throw new Error("hydrated boom")
					})
					.onHydrated(() => record.push("hydrated"))
			},
			steps: async (tab) => {
				await tab.waitForFunction(() => document.getElementById("holed")?.textContent === "filled")
			},
		})
		expect(result.record).toEqual(["ready", "hydrated"])
		expect(result.requests).toEqual(["/holed?_flare=fill"])
		const thrown = result.problems.filter((line) => line.includes("[flare] an app callback threw"))
		expect(thrown).toHaveLength(3)
	})
})
