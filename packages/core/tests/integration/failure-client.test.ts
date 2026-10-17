import { dirname, resolve } from "node:path"
import type { Page } from "@playwright/test"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { appFrom } from "./harness-app.ts"
import { ENGINES, startHarness, type Harness } from "./hydrate.harness.ts"

// A client navigation to a page whose loader fails with a named status, through the real createServer and createClient
// (B96): the layouts above it show what their own loaders returned for the new URL, never nothing and never the last
// page's (plan 21 12.5, B132, BUGS.md 243).

let harness: Harness | undefined

beforeAll(async () => {
	harness = await startHarness(resolve(dirname(expect.getState().testPath ?? ""), "../.."))
})

afterAll(async () => {
	await harness?.close()
})

// A user layout whose loader names its user, over a post page whose loader finds no post called `missing`.
const USERS = appFrom(`
const anchor = (to, id) => api.solid.createComponent(api.web.Dynamic, { component: "a", href: to, id, children: id })
const root = api.rootLayout.createRootLayout("_root_").render((props) => api.h("html", "doc", () => [
	api.h("head", "head"),
	api.h("body", "body", () => [anchor("/users/2/posts/missing", "to-missing"), anchor("/users/3/posts/private", "to-private"), api.h("main", "slot", () => props.children)]),
]))
const user = api.layout.createLayout("_root_/users/[id]")
	.loader(({ params }) => ({ name: "user " + params.id }))
	.render((props) => ["[", () => props.loaderData.name, "|", props.children, "]"])
const post = api.page.createPage("_root_/users/[id]/posts/[post]")
	.loader(({ params }) => {
		if (params.post === "missing") throw api.errors.notFound()
		if (params.post === "private") throw api.errors.unauthorized()
		return { title: "post " + params.post }
	})
	.render((props) => () => props.loaderData.title)
	.notFoundRender(() => "no post")
	.unauthorizedRender(() => "not yours")
const routeTree = [{ id: "_root_/users/[id]/posts/[post]", path: "/users/[id]/posts/[post]", module: post }]
return { router: api.router.createRouter({ layouts: { _root_: root, "_root_/users/[id]": user }, routeTree }) }
`)

// A click on `id`, then what the slot shows once the page under the layout painted its failure.
function clicked(id: string, failure: string): (tab: Page) => Promise<void> {
	return async (tab) => {
		await tab.evaluate((target) => document.getElementById(target)?.click(), id)
		await tab.waitForFunction((text) => document.getElementById("slot")?.textContent?.includes(text) === true, failure)
		const shown = await tab.evaluate(() => document.getElementById("slot")?.textContent)
		await tab.evaluate((all) => (Reflect.get(window, "__flareRecord") as unknown[]).push(all), shown)
	}
}

// Chromium and WebKit log every 4xx response as a console error, Firefox does not (decision B132).
function besidesStatus(problems: readonly string[]): string[] {
	return problems.filter(
		(problem) => !/Failed to load resource: the server responded with a status of 40[134]/.test(problem),
	)
}

describe.each(ENGINES)("%s", (engine) => {
	it("layout data over a failed page", async () => {
		if (harness === undefined) throw new Error("the harness did not start")
		for (const [id, failure, shown] of [
			["to-missing", "no post", "[user 2|no post]"],
			["to-private", "not yours", "[user 3|not yours]"],
		] as const) {
			const result = await harness.app(engine, {
				app: USERS,
				path: "/users/1/posts/a",
				steps: clicked(id, failure),
				client() {},
			})
			expect(besidesStatus(result.problems)).toEqual([])
			expect(result.record).toEqual([shown])
		}
	})
})
