import { createComponent, type Element } from "solid-js"
import { Dynamic } from "@solidjs/web"
import { expect, it } from "vitest"
import { createPage } from "../shared/route-builder/page.ts"
import { createRootLayout } from "../shared/route-builder/root-layout.ts"
import { createRouter } from "../shared/router/create-router.ts"
import { serverCtx } from "../server/context/ctx.ts"
import { createTestServer } from "./harness.ts"

function documentOf(children: Element): Element {
	return createComponent(Dynamic, {
		component: "html",
		get children() {
			return [
				createComponent(Dynamic, { component: "head" }),
				createComponent(Dynamic, { component: "body", children }),
			]
		},
	})
}

// The minimal app's shape: a root layout and one page.
const router = createRouter({
	layouts: { _root_: createRootLayout("_root_").render((props) => documentOf(props.children)) },
	routeTree: [{ id: "_root_/", path: "/", module: createPage("_root_/").render(() => "minimal home") }],
})

it("boots", async () => {
	const server = createTestServer(router)
	const home = await server.fetch("/")
	expect(home.status).toBe(200)
	expect(home.headers.get("content-type")).toMatch(/^text\/html/)
	expect(await home.text()).toContain("minimal home")
	// A URL and a Request work too, and a missing page is the router's 404.
	expect((await server.fetch(new URL("http://localhost/"))).status).toBe(200)
	expect((await server.fetch(new Request("http://localhost/missing"))).status).toBe(404)
	expect((await server.fetch("/", { method: "HEAD" })).status).toBe(200)
})

// The app's own `serverContext` reaches `serverCtx()` in a loader (dx/testing.md, BUGS.md B25).
it("server context", async () => {
	const page = createPage("_root_/ctx")
		.loader(() => ({ id: Reflect.get(Object(serverCtx()), "requestId") }))
		.render((props) => String(Reflect.get(Object(props.loaderData), "id")))
	const app = createRouter({
		layouts: { _root_: createRootLayout("_root_").render((props) => documentOf(props.children)) },
		routeTree: [{ id: "_root_/ctx", path: "/ctx", module: page }],
	})
	const server = createTestServer(app, { serverContext: () => ({ requestId: "r1" }) })
	expect(await (await server.fetch("/ctx")).text()).toContain("r1")
})

// `{ serverContext }` and nothing else: another key is not half-honored. It throws and names itself.
// A missing or wrong router is named at the call, not met later as an engine's TypeError (BUGS.md 477).
it("router required", () => {
	for (const value of [undefined, {}, "router", { match: "no" }]) {
		expect(() => createTestServer(value as never)).toThrow("createTestServer: router is required")
	}
})

it("other keys refused", () => {
	const site = { site: "https://x" } as unknown as Parameters<typeof createTestServer>[1]
	expect(() => createTestServer(router, site)).toThrow("createTestServer takes { serverContext } only, not site")
	const both = { serverContext: () => ({}), store: {} } as unknown as Parameters<typeof createTestServer>[1]
	expect(() => createTestServer(router, both)).toThrow("not store")
	expect(() => Reflect.apply(createTestServer, undefined, [router, {}, {}])).toThrow("not a third argument")
})
