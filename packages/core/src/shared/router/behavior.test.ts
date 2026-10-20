import { expect, it } from "vitest"
import { createRouter } from "./create-router.ts"

function scrollKey(location: { pathname: string }): string {
	return location.pathname
}

it("router options", () => {
	const key = scrollKey
	const router = createRouter({
		layouts: {},
		routeTree: [],
		caseSensitive: true,
		trailingSlash: "never",
		scrollRestoration: false,
		scrollRestorationBehavior: "smooth",
		scrollRestorationMaxEntries: 10,
		getScrollRestorationKey: key,
		routeCacheMaxEntries: 20,
		cache: { client: { staleTime: "1m", gcTime: "10m" } },
	})
	expect(router).toMatchObject({
		caseSensitive: true,
		trailingSlash: "never",
		scrollRestoration: false,
		scrollRestorationBehavior: "smooth",
		scrollRestorationMaxEntries: 10,
		getScrollRestorationKey: key,
		routeCacheMaxEntries: 20,
		cache: { client: { staleTime: 60_000, gcTime: "10m" } },
	})
	expect(createRouter({ layouts: {}, routeTree: [], cache: { client: false } }).cache.client).toBe(false)
	for (const scrollRestorationMaxEntries of [0, 201, 1.5]) {
		expect(() => createRouter({ layouts: {}, routeTree: [], scrollRestorationMaxEntries })).toThrow(
			"scrollRestorationMaxEntries is an integer from 1 to 200",
		)
	}
	for (const routeCacheMaxEntries of [0, 501, 2.5]) {
		expect(() => createRouter({ layouts: {}, routeTree: [], routeCacheMaxEntries })).toThrow(
			"routeCacheMaxEntries is an integer from 1 to 500",
		)
	}
})

// The case rule reaches the matcher: folded by default, so `/ABOUT` matches `/about`, and exact when `caseSensitive`
// is set (BUGS.md 106).
it("case rule", () => {
	const routeTree = [{ id: "_root_/about", path: "/about", module: {} }]
	expect(createRouter({ layouts: { _root_: {} }, routeTree }).match("/ABOUT").id).toBe("_root_/about")
	expect(createRouter({ layouts: { _root_: {} }, routeTree, caseSensitive: true }).match("/ABOUT").id).toBeUndefined()
})

// Both client cache durations are checked when the router is made, naming the field, so a bad `gcTime` never ships a
// page that renders on the server and cannot boot in the browser (BUGS.md 413).
it("client cache checked", () => {
	for (const [client, field] of [
		[{ gcTime: "five minutes" }, "gcTime"],
		[{ gcTime: 5 }, "gcTime"],
		[{ staleTime: "bogus" }, "staleTime"],
	] as const) {
		const cache = { client } as unknown as { client: { gcTime: string } }
		expect(() => createRouter({ layouts: {}, routeTree: [], cache })).toThrow(`cache.client.${field} is not a duration`)
	}
})

// An empty router under this base path.
function based(basePath: string): ReturnType<typeof createRouter> {
	return createRouter({ layouts: {}, routeTree: [], basePath })
}

// `basePath` is `"/"` or one directory a request path can equal: it starts with `/`, ends without one, and reads back
// unchanged as a URL path. Anything else throws at the call, naming it, not a 404 on every route (BUGS.md 409).
it("base path checked", () => {
	for (const basePath of ["/", "/app", "/app/v1", "/%C3%A9"]) expect(based(basePath).basePath).toBe(basePath)
	for (const basePath of [
		"/app/",
		"app",
		"",
		"//",
		"//app",
		"/app?x",
		"/app#x",
		"/a b",
		"/café",
		"/a/../b",
		"/./a",
		"/a\\b",
	]) {
		expect(() => based(basePath)).toThrow(`basePath ${JSON.stringify(basePath)} is not "/" or one directory`)
	}
})
