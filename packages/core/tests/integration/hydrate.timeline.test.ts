import { dirname, resolve } from "node:path"
import { afterAll, beforeAll, expect, it } from "vitest"
import { startHarness, type Harness } from "./hydrate.harness.ts"
import { appFrom } from "./harness-app.ts"

// A document whose body the server never ends: its deferred value never settles, so the stream stays open after the
// shell. The harness reads the whole body before it answers, so the page never loads (BUGS.md 504).
const OPEN = appFrom(`
const root = api.rootLayout.createRootLayout("_root_").render((props) => api.h("html", "doc", () => [
	api.h("head", "head"),
	api.h("body", "body", () => props.children),
]))
const page = api.page
	.createPage("_root_/open")
	.loader(({ defer }) => ({ v: defer(() => new Promise(() => {}), { key: "v" }) }))
	.render((props) => {
		const value = api.deferred.useDeferred(() => props.loaderData.v)
		return api.solid.createComponent(api.solid.Loading, {
			fallback: api.h("p", "wait", () => "wait"),
			get children() { return api.h("p", "value", () => String(value())) },
		})
	})
return { router: api.router.createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/open", path: "/open", module: page }] }) }
`)

let harness: Harness | undefined

beforeAll(async () => {
	harness = await startHarness(resolve(dirname(import.meta.filename), "../.."))
})

afterAll(async () => {
	await harness?.close()
})

// The error names the page's load still in flight and, from the server, the request, its status, the last chunk it
// sent with its bytes, and that the body never ended.
it("open body named", async () => {
	if (harness === undefined) throw new Error("the harness did not start")
	// The page starts well after the harness, so a page clock and a server clock that differ read apart.
	await new Promise((done) => setTimeout(done, 3000))
	const loading = harness.app("chromium", { app: OPEN, path: "/open", loadTimeout: 3000, client() {} })
	const error = await loading.then(
		() => new Error("the document loaded"),
		(caught: unknown) => caught,
	)
	const message = String(error)
	expect(message).toContain("the document did not load")
	expect(message).toMatch(/load \/open started \d+ms, in flight at \d+ms/)
	// One clock: the request reached the server soon after the page started it, though the page started 3 s after the
	// harness (BUGS.md 504.6).
	const started = Number(/load \/open started (\d+)ms/.exec(message)?.[1])
	const arrived = Number(/server \/open[^:]*: in (\d+)ms/.exec(message)?.[1])
	expect(arrived - started).toBeGreaterThanOrEqual(0)
	expect(arrived - started).toBeLessThan(1500)
	// Which siblings exited depends on the files around this one, so only the line's shape is fixed.
	expect(message).toMatch(
		/harness worker \d+; of \d+ workers at the case's start, exited since: (none|\d+( \d+)*) \(an exit/,
	)
	expect(message).toMatch(
		/server \/open \(port \d+, socket request 1\): in \d+ms, answered 200 \d+ms, chunk 1 \d+ bytes \d+ms …".+"(, chunk \d+ .*)?, body never ended \(open at \d+ms\)/,
	)
}, 30_000)
