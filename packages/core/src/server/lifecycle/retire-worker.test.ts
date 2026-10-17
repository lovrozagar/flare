import { createComponent } from "solid-js"
import { Dynamic } from "@solidjs/web"
import { expect, it } from "vitest"
import { createMiddleware } from "../middleware/run.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import type { Logger } from "./logger.ts"
import { serveWith } from "./create.ts"
import { RETIRE_SCRIPT, checkRetired, isRetired, retiredWorker } from "./retire-worker.ts"

function noop(): void {}

const quiet: Logger = { level: "error", error: noop, warn: noop, log: noop }

// A root that writes a document, so an unmatched path is the normal 404.
const root = createRootLayout("_root_").render((props) =>
	createComponent(Dynamic, {
		component: "html",
		get children() {
			return createComponent(Dynamic, { component: "body", children: props.children })
		},
	}),
)

function server(options: { trailingSlash?: "always"; middleware?: ReturnType<typeof createMiddleware>[] } = {}) {
	const page = createPage("_root_/about").render(() => "about")
	const router = createRouter({
		layouts: { _root_: root },
		routeTree: [{ id: "_root_/about", path: "/about", module: page }],
		...(options.trailingSlash === undefined ? {} : { trailingSlash: options.trailingSlash }),
	})
	const middleware = options.middleware ?? []
	return serveWith(
		{ router, retireServiceWorker: ["/service-worker.js", "/sw.js"], middleware },
		{ dev: false, log: quiet },
	)
}

// A retired path answers the worker that unregisters itself: JavaScript, never stored, with the security headers, on
// GET and HEAD, under `trailingSlash: "always"` too, since a worker's update fetch fails on a redirect. Another method
// and another path reach the router (plan 21 16.1).
it("retired path", async () => {
	for (const [app, other] of [
		[server(), 404],
		[server({ trailingSlash: "always" }), 301],
	] as const) {
		const response = await app.fetch(new Request("https://example.com/sw.js"))
		expect(response.status).toBe(200)
		expect(response.headers.get("content-type")).toBe("text/javascript; charset=utf-8")
		expect(response.headers.get("cache-control")).toBe("private, no-store")
		expect(response.headers.get("x-content-type-options")).toBe("nosniff")
		expect(await response.text()).toBe(RETIRE_SCRIPT)
		const head = await app.fetch(new Request("https://example.com/service-worker.js", { method: "HEAD" }))
		expect([head.status, await head.text()]).toEqual([200, ""])
		expect((await app.fetch(new Request("https://example.com/sw.js", { method: "POST" }))).status).toBe(405)
		expect((await app.fetch(new Request("https://example.com/other.js"))).status).toBe(other)
	}
})

// The app's middleware runs first and may answer the path itself.
it("middleware first", async () => {
	const own = createMiddleware(() => new Response("own worker"))
	const response = await server({ middleware: [own] }).fetch(new Request("https://example.com/sw.js"))
	expect(await response.text()).toBe("own worker")
})

// Each entry is a pathname a browser asks for: no query, fragment, space, empty segment, or trailing slash.
it("checked", () => {
	expect(() => checkRetired(undefined)).not.toThrow()
	expect(() => checkRetired("/sw.js")).not.toThrow()
	// A dot segment, raw or escaped, is a path no parsed request holds, so it would never match (BUGS.md 328).
	const dots = ["/./sw.js", "/../sw.js", "/a/../sw.js", "/a/%2e/sw.js", "/a/.%2E/sw.js"]
	for (const bad of ["sw.js", "/sw.js?v=1", "/a#b", "/a b.js", "//sw.js", "/workers/", "/a//b.js", ...dots]) {
		expect(() => checkRetired([bad])).toThrow(`retireServiceWorker takes pathnames such as "/service-worker.js"`)
	}
	expect(() =>
		serveWith(
			{ router: createRouter({ layouts: {}, routeTree: [] }), retireServiceWorker: "x" },
			{ dev: false, log: quiet },
		),
	).toThrow("retireServiceWorker")
	expect(isRetired(undefined, "/sw.js")).toBe(false)
	expect(isRetired("/sw.js", "/sw.js")).toBe(true)
	expect(retiredWorker(new Headers(), "PUT")).toBeUndefined()
})

// The script, run as a worker: it activates at once, clears every cache, unregisters, then reloads each page it
// controlled, and a page that cannot be navigated does not stop the rest.
it("script", async () => {
	const handlers = new Map<string, (event: { waitUntil: (work: Promise<unknown>) => void }) => void>()
	const steps: string[] = []
	const page = (url: string, fails: boolean) => ({
		url,
		navigate: (to: string) =>
			fails ? Promise.reject(new Error("gone")) : Promise.resolve(steps.push(`navigate ${to}`)),
	})
	const worker = {
		addEventListener: (type: string, handler: (event: { waitUntil: (work: Promise<unknown>) => void }) => void) =>
			void handlers.set(type, handler),
		skipWaiting: () => void steps.push("skip waiting"),
		registration: { unregister: async () => void steps.push("unregister") },
		clients: { matchAll: async () => [page("https://example.com/a", false), page("https://example.com/b", true)] },
	}
	const caches = {
		keys: async () => ["flare-assets-1", "app"],
		delete: async (name: string) => void steps.push(`delete ${name}`),
	}
	new Function("self", "caches", RETIRE_SCRIPT)(worker, caches)
	handlers.get("install")?.({ waitUntil: noop })
	let work: Promise<unknown> = Promise.resolve()
	handlers.get("activate")?.({ waitUntil: (promise) => void (work = promise) })
	await work
	expect(steps).toEqual([
		"skip waiting",
		"delete flare-assets-1",
		"delete app",
		"unregister",
		"navigate https://example.com/a",
	])
})
