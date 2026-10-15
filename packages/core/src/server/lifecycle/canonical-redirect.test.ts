import { expect, it } from "vitest"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter, type RouteModule } from "../../shared/router/create-router.ts"
import { applyCanonical } from "./canonical-redirect.ts"
import { createServer, serveWith } from "./create.ts"
import type { Logger } from "./logger.ts"

// A fold toward a route whose static segments are lowercase, as foldCase gives for one.
const fold = (path: string): string => path.toLowerCase()

it("once", () => {
	expect(applyCanonical({ method: "GET", url: "/A/", trailingSlash: "never", caseSensitive: false, fold })).toEqual({
		status: 301,
		location: "/a",
	})
})

it("rewrite recanonical", () => {
	let calls = 0
	const result = applyCanonical({
		method: "GET",
		url: "/old",
		trailingSlash: "never",
		caseSensitive: false,
		fold,
		rewrite(path) {
			calls += 1
			return path === "/old" ? "/A/" : undefined
		},
	})
	// The second call is the check that the replacement stays put.
	expect(calls).toBe(2)
	expect(result).toEqual({ status: 301, location: "/a" })
})

// A replacement the rewrite changes again would answer a chain of redirects, a loop here, so it throws, naming the
// paths (dx/server.md `rewrite`). A rewrite that maps its replacement to itself ends in one step.
it("rewrite loop", () => {
	expect(() => applyCanonical({ method: "GET", url: "/a", rewrite: swap })).toThrow(
		"rewrite: /a became /b, which rewrites again to /a. A rewrite ends in one step",
	)
	expect(applyCanonical({ method: "GET", url: "/a", rewrite: () => "/x" })).toEqual({ status: 301, location: "/x" })
})

it("path string", () => {
	let seen = ""
	applyCanonical({
		method: "GET",
		url: "/old",
		rewrite(path) {
			seen = path
			return undefined
		},
	})
	expect(seen).toBe("/old")
	// @ts-expect-error a location object is not a pathname
	applyCanonical({ method: "GET", url: "/old", rewrite: () => ({ pathname: "/new", search: "", hash: "" }) })
})

it("hostile", () => {
	const result = applyCanonical({ method: "GET", url: "/%2f" })
	expect(result.status).toBe(400)
	expect(result).not.toHaveProperty("location")
	const rewritten = applyCanonical({ method: "GET", url: "/old", rewrite: () => "/%2f" })
	expect(rewritten.status).toBe(400)
	expect(rewritten).not.toHaveProperty("location")
})

it("search kept", () => {
	const result = applyCanonical({ method: "GET", url: "/About?q=1&q=2#top", caseSensitive: false, fold })
	expect(result).toEqual({ status: 301, location: "/about?q=1&q=2" })
	expect(result.location).not.toContain("#")
})

it("method kept", () => {
	expect(applyCanonical({ method: "HEAD", url: "/A", caseSensitive: false, fold })).toEqual({
		status: 301,
		location: "/a",
	})
	for (const method of ["POST", "PUT", "DELETE"]) {
		expect(applyCanonical({ method, url: "/A?x=1", caseSensitive: false, fold })).toEqual({
			status: 308,
			location: "/a?x=1",
		})
	}
})

it("fn path exempt", () => {
	const options = { method: "POST", trailingSlash: "always" as const, caseSensitive: false, fold }
	expect(applyCanonical({ ...options, url: "/_flare/fn/0123456789ABCDEF" })).toEqual({ status: 200 })
	expect(applyCanonical({ ...options, url: "/_flare/fn/%2f" }).status).toBe(400)
	expect(applyCanonical({ ...options, url: "/About" })).toEqual({ status: 308, location: "/about/" })
	const based = { ...options, basePath: "/app" }
	expect(applyCanonical({ ...based, url: "/app/_flare/fn/0123456789ABCDEF" })).toEqual({ status: 200 })
	expect(applyCanonical({ ...based, url: "/_flare/fn/0123456789ABCDEF" })).toEqual({
		status: 308,
		location: "/_flare/fn/0123456789abcdef/",
	})
})

// A server over one page, whose render prints the params it received.
function serve(id: string, path: string, locale?: { locales: string[]; defaultLocale: string }) {
	const root = createRootLayout("_root_").render((props) => props.children)
	const page: RouteModule = createPage(id).render((props) => JSON.stringify(props.params))
	const router = createRouter({
		layouts: { _root_: root },
		routeTree: [{ id, path, module: page }],
		...(locale && { locale }),
	})
	const server = createServer({ router })
	return (url: string): Promise<Response> => server.fetch(new Request(`http://site.test${url}`))
}

it("param case kept", async () => {
	const response = await serve("_root_/users/[id]", "/users/[id]")("/users/AbC123")
	expect(response.status).toBe(200)
	expect(await response.text()).toContain("AbC123")
})

it("static case", async () => {
	const response = await serve("_root_/users/[id]", "/users/[id]")("/Users/AbC123?x=1")
	expect(response.status).toBe(301)
	expect(response.headers.get("location")).toBe("/users/AbC123?x=1")
})

it("hex kept", async () => {
	const response = await serve("_root_/[slug]", "/[slug]")("/%C4%8D")
	expect(response.status).toBe(200)
	expect(response.headers.get("location")).toBeNull()
})

it("unmatched case", async () => {
	const response = await serve("_root_/users/[id]", "/users/[id]")("/NOWHERE")
	expect(response.status).toBe(404)
	expect(response.headers.get("location")).toBeNull()
})

it("locale case", async () => {
	const get = serve("_root_/[[locale]]/pricing", "/[[locale]]/pricing", {
		locales: ["en-US", "hr"],
		defaultLocale: "hr",
	})
	for (const url of ["/EN-us/Pricing", "/en-us/pricing"]) {
		const response = await get(url)
		expect(response.status).toBe(301)
		expect(response.headers.get("location")).toBe("/en-US/pricing")
	}
	expect((await get("/en-US/pricing")).status).toBe(200)
})

// A mount prefix folds like a static segment: one redirect to its spelling, the rest of the path as sent.
it("mount case", async () => {
	const root = createRootLayout("_root_").render((props) => props.children)
	const server = createServer({
		router: createRouter({ layouts: { _root_: root }, routeTree: [] }),
		mounts: [{ prefix: "/api", fetch: (request) => new Response(`api ${new URL(request.url).pathname}`) }],
	})
	const moved = await server.fetch(new Request("http://site.test/API/Users?x=1"))
	expect(moved.status).toBe(301)
	expect(moved.headers.get("location")).toBe("/api/Users?x=1")
	const answered = await server.fetch(new Request("http://site.test/api/Users?x=1"))
	expect(await answered.text()).toBe("api /Users")
	expect((await server.fetch(new Request("http://site.test/APIX"))).status).toBe(404)
})

// The router's `trailingSlash` reaches the canonical redirect: `never` sends `/about/` to `/about` (BUGS.md 106).
it("trailing slash option", async () => {
	const about = createPage("_root_/about").render(() => "about")
	const root = createRootLayout("_root_").render((props) => props.children)
	const router = createRouter({
		layouts: { _root_: root },
		routeTree: [{ id: "_root_/about", path: "/about", module: about }],
		trailingSlash: "never",
	})
	const response = await createServer({ router }).fetch(new Request("http://localhost/about/"))
	expect([response.status, response.headers.get("location")]).toEqual([301, "/about"])
})

// createServer's `rewrite` reaches the canonical step (BUGS.md 108): a moved path redirects, a mount's path is never
// rewritten (mounts run first, 02-system step 4), and a rewrite that throws, or does not end in one step, is a
// projected 500.
it("rewrite option", async () => {
	const about = createPage("_root_/about").render(() => "about")
	const root = createRootLayout("_root_").render((props) => props.children)
	const errors: string[] = []
	const log: Logger = { level: "error", error: (tag) => void errors.push(tag), warn: noop, log: noop }
	const server = serveWith(
		{
			router: createRouter({
				layouts: { _root_: root },
				routeTree: [{ id: "_root_/about", path: "/about", module: about }],
			}),
			mounts: [{ prefix: "/api", fetch: (request) => new Response(`api ${new URL(request.url).pathname}`) }],
			rewrite(path) {
				if (path === "/boom") throw new Error("rewrite bug")
				return { "/old": "/about", "/api/old": "/about", "/a": "/b", "/b": "/a" }[path]
			},
		},
		{ dev: false, log },
	)
	const status = async (path: string): Promise<[number, string | null]> => {
		const response = await server.fetch(new Request(`http://site.test${path}`))
		return [response.status, response.headers.get("location")]
	}
	expect(await status("/old?q=1")).toEqual([301, "/about?q=1"])
	expect(await (await server.fetch(new Request("http://site.test/api/old"))).text()).toBe("api /old")
	expect(await status("/boom")).toEqual([500, null])
	expect(await status("/a")).toEqual([500, null])
	expect(errors).toEqual(["render", "render"])
})

function noop(): void {}

function swap(path: string): string | undefined {
	return { "/a": "/b", "/b": "/a" }[path]
}
