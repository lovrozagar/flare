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
