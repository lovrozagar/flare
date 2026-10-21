import { dirname, resolve } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { flarePage, type FlareState } from "../../src/testing/index.ts"
import { ENGINES, startHarness, type Api, type Engine, type Harness } from "./hydrate.harness.ts"

// flarePage over a real Playwright page in every engine (B96, dx/testing.md): the harness serves a document the real
// `createServer(...).fetch` answers and the real `createClient` hydrates, and the helper loads it again, reads its
// console, and reads its `self.flare`. One harness boot serves the file.
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

// A root and a page with loader data, built on both sides from this source. The page can revalidate, as a sign-out
// does.
function app(api: Api): { router: unknown } {
	if (typeof window !== "undefined") Object.assign(window, { __flareInvalidate: api.active.invalidate })
	const root = api.rootLayout.createRootLayout("_root_").render((props) => props.children)
	const home = api.page
		.createPage("_root_/")
		.loader(() => ({ greeting: "hello" }))
		.render(() => "home")
	const routeTree = [{ id: "_root_/", path: "/", module: home }]
	return { router: api.router.createRouter({ layouts: { _root_: root }, routeTree }) }
}

type Seen = { hydrated: boolean; errors: string[]; state: FlareState | undefined; policy: string }

// The helper on the harness's page, whose client waits 300 ms before `createClient`, so hydration lands after the
// load event: `load` goes to the page again and resolves only once `<html data-flare-hydrated>` is set,
// `consoleErrors` holds what the page logged as an error since the helper was made, and `state` reads `self.flare`,
// whose nonce is the one the document's CSP header carries. The page's client logs one error after hydrate.
async function helperOn(engine: Engine): Promise<Seen> {
	const seen: Seen = { hydrated: false, errors: [], state: undefined, policy: "" }
	await started().app(engine, {
		app,
		hydrateAfter: 300,
		client(client) {
			client.onHydrated(() => console.error("planted error"))
		},
		async steps(tab) {
			const helper = flarePage(tab)
			tab.on("response", (response) => {
				if (response.request().resourceType() === "document")
					seen.policy = response.headers()["content-security-policy"] ?? ""
			})
			await helper.load(new URL("/", tab.url()).href)
			seen.hydrated = await tab.evaluate(() => document.documentElement.hasAttribute("data-flare-hydrated"))
			seen.errors = helper.consoleErrors()
			seen.state = await helper.state()
		},
	})
	return seen
}

type Held = { ms: number; hydrated: boolean; dropped: string[]; state: FlareState | undefined }

// A resource that never answers holds the page's load event: `load` still resolves once the page hydrates, well inside
// its deadline (BUGS.md 472). Then a revalidation drops `self.flare` down to `call`, and `state` still reads the state
// the document hydrated with (BUGS.md 475).
async function heldOn(engine: Engine): Promise<Held> {
	const seen: Held = { ms: 0, hydrated: false, dropped: [], state: undefined }
	await started().app(engine, {
		app,
		client() {},
		async steps(tab) {
			const helper = flarePage(tab)
			await tab.route("**/held.png", () => undefined)
			await tab.addInitScript(() => {
				new Image().src = "/held.png"
			})
			const start = Date.now()
			await helper.load(new URL("/", tab.url()).href)
			seen.ms = Date.now() - start
			seen.hydrated = await tab.evaluate(() => document.documentElement.hasAttribute("data-flare-hydrated"))
			await tab.evaluate(() => (Reflect.get(window, "__flareInvalidate") as () => Promise<void>)())
			seen.dropped = await tab.evaluate(() => Object.keys(Reflect.get(window, "flare") as object))
			seen.state = await helper.state()
		},
	})
	return seen
}

describe.each(ENGINES)("%s", (engine) => {
	it("held load and revalidation", async () => {
		const seen = await heldOn(engine)
		expect(seen.hydrated).toBe(true)
		expect(seen.ms).toBeLessThan(15_000)
		expect(seen.dropped).toEqual(["call"])
		expect(seen.state?.matches.map((match) => match.id)).toEqual(["_root_", "_root_/"])
		expect(seen.state?.matches[1]?.data).toEqual({ greeting: "hello" })
	}, 60_000)

	it("helper on a real page", async () => {
		const seen = await helperOn(engine)
		expect(seen.hydrated).toBe(true)
		expect(seen.errors).toContain("planted error")
		expect(seen.state?.build).toBe("dev")
		expect(seen.state?.nonce).toMatch(/^[0-9a-f]{32}$/)
		expect(seen.policy).toContain(`'nonce-${seen.state?.nonce}'`)
		expect(seen.state?.matches.map((match) => match.id)).toEqual(["_root_", "_root_/"])
		expect(seen.state?.matches[1]?.data).toEqual({ greeting: "hello" })
		expect(seen.state?.queries).toBeNull()
	})
})
