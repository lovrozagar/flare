import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createMatchCache } from "../../../src/caches/index.ts"
import { createScrollStore, restoreScroll } from "../../../src/history/index.ts"
import type { RouteData } from "../../../src/router-primitives/index.ts"
import {
	createTreeNode,
	insertRoute,
	matchRoute,
	matchRoutePartial,
} from "../../../src/router-primitives/index.ts"
import { normalizeUrl } from "../../../src/server-handler/index.ts"

function route(virtualPath: string, variablePath: string): RouteData {
	return {
		e: "default",
		o: {},
		p: () => Promise.resolve({ default: null }),
		t: "r",
		v: variablePath,
		x: virtualPath,
	}
}

/* ── caseSensitive ─────────────────────────────────────────────────── */

describe("caseSensitive", () => {
	it("default (false): /About matches /about route", () => {
		const tree = createTreeNode()
		insertRoute(tree, "/about", route("_root_/about", "/about"))
		expect(matchRoute(tree, "/About")?.route).toBeDefined()
		expect(matchRoute(tree, "/ABOUT")?.route).toBeDefined()
	})

	it("caseSensitive=true: /About does NOT match /about route", () => {
		const tree = createTreeNode()
		insertRoute(tree, "/about", route("_root_/about", "/about"))
		expect(matchRoute(tree, "/About", true)).toBeNull()
		expect(matchRoute(tree, "/ABOUT", true)).toBeNull()
	})

	it("caseSensitive=true: exact case matches", () => {
		const tree = createTreeNode()
		insertRoute(tree, "/about", route("_root_/about", "/about"))
		expect(matchRoute(tree, "/about", true)?.route).toBeDefined()
	})

	it("caseSensitive threads through matchRoutePartial", () => {
		const tree = createTreeNode()
		const root = route("_root_", "/")
		const products = route("_root_/products", "/products")
		insertRoute(tree, "/", root)
		insertRoute(tree, "/products", products)

		/* case-insensitive: /Products/x should partial-match /products */
		const insensitive = matchRoutePartial(tree, "/Products/x", false)
		expect(insensitive?.route).toBe(products)

		/* case-sensitive: /Products/x should NOT match /products, falls back to root */
		const sensitive = matchRoutePartial(tree, "/Products/x", true)
		expect(sensitive?.route).toBe(root)
	})

	it("params still decoded correctly with caseSensitive=true", () => {
		const tree = createTreeNode()
		insertRoute(tree, "/users/[name]", route("_root_/users/[name]", "/users/[name]"))
		const result = matchRoute(tree, "/users/JohnDoe", true)
		expect(result?.params).toEqual({ name: "JohnDoe" })
	})
})

/* ── trailingSlash ─────────────────────────────────────────────────── */

describe("trailingSlash", () => {
	describe('mode: "never" (default)', () => {
		it("strips trailing slash → 301", () => {
			const result = normalizeUrl(new URL("http://localhost/about/"))
			expect(result?.status).toBe(301)
			expect(result?.headers.get("Location")).toBe("/about")
		})

		it("no trailing slash → pass through", () => {
			expect(normalizeUrl(new URL("http://localhost/about"))).toBeNull()
		})

		it("root / → pass through", () => {
			expect(normalizeUrl(new URL("http://localhost/"))).toBeNull()
		})
	})

	describe('mode: "always"', () => {
		it("adds trailing slash → 301", () => {
			const result = normalizeUrl(new URL("http://localhost/about"), "always")
			expect(result?.status).toBe(301)
			expect(result?.headers.get("Location")).toBe("/about/")
		})

		it("already has trailing slash → pass through", () => {
			expect(normalizeUrl(new URL("http://localhost/about/"), "always")).toBeNull()
		})

		it("root / → pass through (no double slash)", () => {
			expect(normalizeUrl(new URL("http://localhost/"), "always")).toBeNull()
		})

		it("preserves query + hash", () => {
			const result = normalizeUrl(new URL("http://localhost/about?q=1#top"), "always")
			expect(result?.headers.get("Location")).toBe("/about/?q=1#top")
		})
	})

	describe('mode: "preserve"', () => {
		it("trailing slash → pass through", () => {
			expect(normalizeUrl(new URL("http://localhost/about/"), "preserve")).toBeNull()
		})

		it("no trailing slash → pass through", () => {
			expect(normalizeUrl(new URL("http://localhost/about"), "preserve")).toBeNull()
		})
	})
})

/* ── basePath ──────────────────────────────────────────────────────── */

describe("basePath (server-side stripping)", () => {
	/* basePath server logic is tested via createServerHandler integration tests.
	 * Here we test the underlying matchRoute with manually stripped paths. */
	it("route tree works with basePath-stripped pathname", () => {
		const tree = createTreeNode()
		const aboutRoute = route("_root_/about", "/about")
		insertRoute(tree, "/about", aboutRoute)

		/* Simulate basePath=/app stripping: /app/about → /about */
		const pathname = "/app/about"
		const bp = "/app"
		const stripped = pathname.slice(bp.length) || "/"
		expect(matchRoute(tree, stripped)?.route).toBe(aboutRoute)
	})

	it("stripped root works", () => {
		const tree = createTreeNode()
		const rootRoute = route("_root_", "/")
		insertRoute(tree, "/", rootRoute)

		const pathname = "/app"
		const bp = "/app"
		const stripped = pathname.slice(bp.length) || "/"
		expect(matchRoute(tree, stripped)?.route).toBe(rootRoute)
	})
})

/* ── basePath edge cases ──────────────────────────────────────────── */

describe("basePath edge cases", () => {
	it("basePath with trailing slash in config strips correctly", () => {
		const tree = createTreeNode()
		const aboutRoute = route("_root_/about", "/about")
		insertRoute(tree, "/about", aboutRoute)

		/* Config basePath="/app/" — strip trailing slash before use */
		const bp = "/app/"
		const normalizedBp = bp.replace(/\/$/, "")
		const pathname = "/app/about"
		const stripped = pathname.slice(normalizedBp.length) || "/"
		expect(matchRoute(tree, stripped)?.route).toBe(aboutRoute)
	})

	it("empty string basePath behaves like no basePath", () => {
		const tree = createTreeNode()
		const aboutRoute = route("_root_/about", "/about")
		insertRoute(tree, "/about", aboutRoute)

		const bp: string = ""
		const pathname = "/about"
		const stripped = bp ? pathname.slice(bp.length) || "/" : pathname
		expect(matchRoute(tree, stripped)?.route).toBe(aboutRoute)
	})

	it("basePath + trailingSlash=always: normalizeUrl still works on full path", () => {
		/* /app/about → should redirect to /app/about/ */
		const result = normalizeUrl(new URL("http://localhost/app/about"), "always")
		expect(result?.status).toBe(301)
		expect(result?.headers.get("Location")).toBe("/app/about/")
	})

	it("caseSensitive + dynamic param: params still decoded", () => {
		const tree = createTreeNode()
		insertRoute(tree, "/users/[id]", route("_root_/users/[id]", "/users/[id]"))

		const match = matchRoute(tree, "/users/42", true)
		expect(match?.params.id).toBe("42")
	})

	it("caseSensitive with multi-segment paths", () => {
		const tree = createTreeNode()
		insertRoute(tree, "/products/details", route("_root_/products/details", "/products/details"))

		expect(matchRoute(tree, "/Products/Details", false)?.route).toBeDefined()
		expect(matchRoute(tree, "/Products/Details", true)).toBeNull()
		expect(matchRoute(tree, "/products/details", true)?.route).toBeDefined()
	})
})

/* ── routeCacheMaxEntries ──────────────────────────────────────────── */

describe("routeCacheMaxEntries", () => {
	it("default maxSize evicts at 500", () => {
		const cache = createMatchCache()
		for (let i = 0; i < 501; i++) {
			cache.set({ data: i, invalid: false, matchId: `m${i}`, updatedAt: Date.now() })
		}
		/* First entry evicted */
		expect(cache.get("m0")).toBeUndefined()
		expect(cache.size()).toBe(500)
	})

	it("custom maxSize=3 evicts at 3", () => {
		const cache = createMatchCache(3)
		cache.set({ data: "a", invalid: false, matchId: "m1", updatedAt: Date.now() })
		cache.set({ data: "b", invalid: false, matchId: "m2", updatedAt: Date.now() })
		cache.set({ data: "c", invalid: false, matchId: "m3", updatedAt: Date.now() })
		cache.set({ data: "d", invalid: false, matchId: "m4", updatedAt: Date.now() })
		expect(cache.get("m1")).toBeUndefined()
		expect(cache.size()).toBe(3)
		expect(cache.get("m4")?.data).toBe("d")
	})
})

/* ── scrollRestoration ─────────────────────────────────────────────── */

describe("scrollRestoration", () => {
	/* scrollRestoration=false skips history.scrollRestoration = "manual"
	 * This is tested via setupNavigation integration — here we verify the
	 * building blocks work correctly. */

	it("createScrollStore default maxSize=200", () => {
		const store = createScrollStore()
		for (let i = 0; i < 201; i++) {
			store.save(`k${i}`, { x: 0, y: i })
		}
		/* First entry evicted */
		expect(store.get("k0")).toBeNull()
		expect(store.get("k200")).toEqual({ x: 0, y: 200 })
	})
})

/* ── scrollRestorationBehavior ─────────────────────────────────────── */

describe("scrollRestorationBehavior", () => {
	let scrollToSpy: ReturnType<typeof vi.fn>

	beforeEach(() => {
		scrollToSpy = vi.fn()
		vi.stubGlobal("scrollTo", scrollToSpy)
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it("default: restoreScroll calls scrollTo with behavior auto", () => {
		restoreScroll({ x: 10, y: 20 })
		expect(scrollToSpy).toHaveBeenCalledWith({ behavior: "auto", left: 10, top: 20 })
	})

	it('behavior "smooth": restoreScroll calls scrollTo with smooth', () => {
		restoreScroll({ x: 0, y: 100 }, "smooth")
		expect(scrollToSpy).toHaveBeenCalledWith({ behavior: "smooth", left: 0, top: 100 })
	})
})

/* ── scrollRestorationMaxEntries ───────────────────────────────────── */

describe("scrollRestorationMaxEntries", () => {
	it("custom maxSize=5 evicts oldest entries", () => {
		const store = createScrollStore(5)
		for (let i = 0; i < 6; i++) {
			store.save(`key${i}`, { x: 0, y: i })
		}
		expect(store.get("key0")).toBeNull()
		expect(store.get("key5")).toEqual({ x: 0, y: 5 })
	})

	it("re-saving existing key refreshes position (LRU)", () => {
		const store = createScrollStore(3)
		store.save("a", { x: 0, y: 1 })
		store.save("b", { x: 0, y: 2 })
		store.save("c", { x: 0, y: 3 })
		/* Re-save "a" — moves to end */
		store.save("a", { x: 0, y: 10 })
		/* Now add "d" — "b" should be evicted (oldest) */
		store.save("d", { x: 0, y: 4 })
		expect(store.get("b")).toBeNull()
		expect(store.get("a")).toEqual({ x: 0, y: 10 })
	})
})
