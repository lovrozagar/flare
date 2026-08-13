import { describe, expect, it } from "vitest"
import type { ExtractedCacheConfig, RouteDefinition } from "../../../src/generators/index.ts"
import {
	createDevPrerenderPlugin,
	filterDevPrerenderRoutes,
} from "../../../src/plugins/dev-prerender.ts"

const defaultCache: ExtractedCacheConfig = {
	isrDynamicParams: true,
}

function makeDef(overrides: Partial<RouteDefinition>): RouteDefinition {
	return {
		authenticateMode: false,
		cache: { ...defaultCache },
		exportName: "TestPage",
		filePath: "src/routes/test.page.tsx",
		hasInput: false,
		responseRoute: false,
		type: "page",
		virtualPath: "_root_/test",
		...overrides,
	}
}

describe("filterDevPrerenderRoutes", () => {
	it("includes SSG routes", () => {
		const defs = [makeDef({ cache: { ...defaultCache, ssg: true }, virtualPath: "_root_/about" })]
		const routes = filterDevPrerenderRoutes(defs)
		expect(routes).toHaveLength(1)
		expect(routes[0]?.mode).toBe("static")
		expect(routes[0]?.pathname).toBe("/about")
	})

	it("excludes ISR routes", () => {
		const defs = [
			makeDef({
				cache: { ...defaultCache, isr: true, isrRevalidate: 60 },
				virtualPath: "_root_/blog",
			}),
		]
		const routes = filterDevPrerenderRoutes(defs)
		expect(routes).toHaveLength(0)
	})

	it("excludes dynamic SSG routes (with path params)", () => {
		const defs = [
			makeDef({
				cache: { ...defaultCache, ssg: true },
				virtualPath: "_root_/blog/[slug]",
			}),
		]
		const routes = filterDevPrerenderRoutes(defs)
		expect(routes).toHaveLength(0)
	})

	it("excludes layouts and non-page types", () => {
		const defs = [
			makeDef({
				cache: { ...defaultCache, ssg: true },
				type: "layout",
				virtualPath: "_root_",
			}),
		]
		const routes = filterDevPrerenderRoutes(defs)
		expect(routes).toHaveLength(0)
	})

	it("excludes SSR routes", () => {
		const defs = [makeDef({ virtualPath: "_root_/dynamic" })]
		const routes = filterDevPrerenderRoutes(defs)
		expect(routes).toHaveLength(0)
	})

	it("multiple routes — only SSG non-dynamic returned", () => {
		const defs = [
			makeDef({ cache: { ...defaultCache, ssg: true }, virtualPath: "_root_/about" }),
			makeDef({ cache: { ...defaultCache, ssg: true }, virtualPath: "_root_/faq" }),
			makeDef({
				cache: { ...defaultCache, isr: true, isrRevalidate: 30 },
				virtualPath: "_root_/posts",
			}),
			makeDef({ virtualPath: "_root_/contact" }),
		]
		const routes = filterDevPrerenderRoutes(defs)
		expect(routes).toHaveLength(2)
		expect(routes.map((r) => r.pathname)).toEqual(["/about", "/faq"])
	})
})

describe("createDevPrerenderPlugin", () => {
	it("returns a Vite plugin with name and configureServer", () => {
		const plugin = createDevPrerenderPlugin({})
		expect(plugin.name).toBe("flare:dev-prerender")
		expect(plugin.configureServer).toBeDefined()
	})
})
