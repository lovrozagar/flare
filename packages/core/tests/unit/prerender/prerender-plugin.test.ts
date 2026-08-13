/** @vitest-environment node */
import { describe, expect, it } from "vitest"
import type { RouteDefinition } from "../../../src/generators/index.ts"
import type { PrerenderManifestEntry } from "../../../src/prerender/index.ts"
import { buildPrerenderRoutes, writePrerenderOutput } from "../../../src/prerender/index.ts"

/* ── buildPrerenderRoutes ────────────────────────────────────────── */

describe("buildPrerenderRoutes", () => {
	it("returns empty for routes with no ssg/isr config", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: {},
				exportName: "aboutPage",
				filePath: "src/routes/about.tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/about",
			},
		]
		const result = buildPrerenderRoutes(defs)
		expect(result).toEqual([])
	})

	it("builds static route for ssg: true", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: { ssg: true },
				exportName: "aboutPage",
				filePath: "src/routes/about.tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/about",
			},
		]
		const result = buildPrerenderRoutes(defs)
		expect(result).toHaveLength(1)
		expect(result[0]?.pathname).toBe("/about")
		expect(result[0]?.mode).toBe("static")
	})

	it("builds ISR route for isr config", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: { isr: true, isrRevalidate: 300 },
				exportName: "pricingPage",
				filePath: "src/routes/pricing.tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/pricing",
			},
		]
		const result = buildPrerenderRoutes(defs)
		expect(result).toHaveLength(1)
		expect(result[0]?.mode).toBe("isr")
		expect(result[0]?.revalidate).toBe(300)
	})

	it("sets defer and dynamicParams from isr config", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: {
					isr: "dynamic",
					isrDefer: "stream",
					isrDynamicParams: false,
					isrRevalidate: 60,
				},
				exportName: "productPage",
				filePath: "src/routes/products/[id].tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/products/[id]",
			},
		]
		const staticParams = new Map([["_root_/products/[id]", [{ id: "1" }, { id: "2" }]]])
		const result = buildPrerenderRoutes(defs, staticParams)
		expect(result).toHaveLength(2)
		expect(result[0]?.defer).toBe("stream")
		expect(result[0]?.dynamicParams).toBe(false)
		expect(result[0]?.revalidate).toBe(60)
		expect(result[0]?.pathname).toBe("/products/1")
		expect(result[1]?.pathname).toBe("/products/2")
	})

	it("skips layouts and root-layouts", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: { ssg: true },
				exportName: "rootLayout",
				filePath: "src/routes/_root_/layout.tsx",
				hasInput: false,
				responseRoute: false,
				type: "root-layout",
				virtualPath: "_root_",
			},
			{
				authenticateMode: false,
				cache: { ssg: true },
				exportName: "aboutPage",
				filePath: "src/routes/about.tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/about",
			},
		]
		const result = buildPrerenderRoutes(defs)
		expect(result).toHaveLength(1)
		expect(result[0]?.pathname).toBe("/about")
	})

	it("skips response routes", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: { ssg: true },
				exportName: "apiRoute",
				filePath: "src/routes/api.ts",
				hasInput: false,
				responseRoute: true,
				type: "page",
				virtualPath: "_root_/api",
			},
		]
		const result = buildPrerenderRoutes(defs)
		expect(result).toEqual([])
	})

	it("rejects authenticated routes with ssg config", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: true,
				cache: { ssg: true },
				exportName: "dashPage",
				filePath: "src/routes/dashboard.tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/dashboard",
			},
		]
		expect(() => buildPrerenderRoutes(defs)).toThrow(/authenticate.*static/)
	})

	it("rejects authenticated routes with isr config", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: true,
				cache: { isr: true, isrRevalidate: 60 },
				exportName: "dashPage",
				filePath: "src/routes/dashboard.tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/dashboard",
			},
		]
		expect(() => buildPrerenderRoutes(defs)).toThrow(/authenticate.*static/)
	})

	it("skips isr routes without revalidate (on-demand only)", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: { isr: true },
				exportName: "cachedPage",
				filePath: "src/routes/cached.tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/cached",
			},
		]
		const result = buildPrerenderRoutes(defs)
		expect(result).toEqual([])
	})

	it("skips isr dynamic routes without revalidate (on-demand only)", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: { isr: "dynamic" },
				exportName: "postPage",
				filePath: "src/routes/posts/[slug].tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/posts/[slug]",
			},
		]
		const result = buildPrerenderRoutes(defs)
		expect(result).toEqual([])
	})

	it("allows authenticateOptional with ssg config", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: "optional",
				cache: { ssg: true },
				exportName: "homePage",
				filePath: "src/routes/index.tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/",
			},
		]
		const result = buildPrerenderRoutes(defs)
		expect(result).toHaveLength(1)
	})

	it("handles index page (virtualPath _root_/ → /)", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: { ssg: true },
				exportName: "homePage",
				filePath: "src/routes/index.tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/",
			},
		]
		const result = buildPrerenderRoutes(defs)
		expect(result[0]?.pathname).toBe("/")
	})

	it("handles group segments (skip them in pathname)", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: { ssg: true },
				exportName: "shopPage",
				filePath: "src/routes/(shop)/products.tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/(shop)/products",
			},
		]
		const result = buildPrerenderRoutes(defs)
		expect(result[0]?.pathname).toBe("/products")
	})

	it("handles ssg dynamic routes with staticParams", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: { ssg: "dynamic" },
				exportName: "userPage",
				filePath: "src/routes/users/[id].tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/users/[id]",
			},
		]
		const staticParams = new Map([["_root_/users/[id]", [{ id: "alice" }, { id: "bob" }]]])
		const result = buildPrerenderRoutes(defs, staticParams)
		expect(result).toHaveLength(2)
		expect(result[0]?.mode).toBe("static")
		expect(result[0]?.pathname).toBe("/users/alice")
		expect(result[1]?.pathname).toBe("/users/bob")
	})

	it("skips ssg dynamic routes without staticParams", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: { ssg: "dynamic" },
				exportName: "userPage",
				filePath: "src/routes/users/[id].tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/users/[id]",
			},
		]
		const result = buildPrerenderRoutes(defs)
		expect(result).toHaveLength(0)
	})

	it("handles dynamicParams: false mapped correctly", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: {
					isr: "dynamic",
					isrDynamicParams: false,
					isrRevalidate: 120,
				},
				exportName: "postPage",
				filePath: "src/routes/posts/[slug].tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/posts/[slug]",
			},
		]
		const staticParams = new Map([["_root_/posts/[slug]", [{ slug: "hello" }]]])
		const result = buildPrerenderRoutes(defs, staticParams)
		expect(result[0]?.dynamicParams).toBe(false)
	})

	it("ssg defer preserved", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: { ssg: true, ssgDefer: "stream" },
				exportName: "aboutPage",
				filePath: "src/routes/about.tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/about",
			},
		]
		const result = buildPrerenderRoutes(defs)
		expect(result[0]?.defer).toBe("stream")
	})

	it("expands inherited layout params for pages with ssg: true", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: { ssg: true },
				exportName: "aboutPage",
				filePath: "src/routes/[locale]/about.tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/[locale]/about",
			},
		]
		const staticParams = new Map([["_root_/[locale]/about", [{ locale: "en" }, { locale: "fr" }]]])
		const result = buildPrerenderRoutes(defs, staticParams)
		expect(result).toHaveLength(2)
		expect(result[0]?.pathname).toBe("/en/about")
		expect(result[1]?.pathname).toBe("/fr/about")
	})

	it("expands catch-all params", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: { ssg: "dynamic" },
				exportName: "docsPage",
				filePath: "src/routes/docs/[...slug].tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/docs/[...slug]",
			},
		]
		const staticParams = new Map([
			["_root_/docs/[...slug]", [{ slug: ["getting-started"] }, { slug: ["api", "auth"] }]],
		])
		const result = buildPrerenderRoutes(defs, staticParams)
		expect(result).toHaveLength(2)
		expect(result[0]?.pathname).toBe("/docs/getting-started")
		expect(result[1]?.pathname).toBe("/docs/api/auth")
	})

	it("expands multiple dynamic segments", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: { ssg: "dynamic" },
				exportName: "postPage",
				filePath: "src/routes/[locale]/blog/[slug].tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/[locale]/blog/[slug]",
			},
		]
		const staticParams = new Map([
			[
				"_root_/[locale]/blog/[slug]",
				[
					{ locale: "en", slug: "hello" },
					{ locale: "en", slug: "world" },
					{ locale: "fr", slug: "hello" },
					{ locale: "fr", slug: "world" },
				],
			],
		])
		const result = buildPrerenderRoutes(defs, staticParams)
		expect(result).toHaveLength(4)
		expect(result[0]?.pathname).toBe("/en/blog/hello")
		expect(result[1]?.pathname).toBe("/en/blog/world")
		expect(result[2]?.pathname).toBe("/fr/blog/hello")
		expect(result[3]?.pathname).toBe("/fr/blog/world")
	})

	it("mixed static + dynamic routes", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: { ssg: true },
				exportName: "aboutPage",
				filePath: "src/routes/about.tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/about",
			},
			{
				authenticateMode: false,
				cache: { ssg: "dynamic" },
				exportName: "postPage",
				filePath: "src/routes/posts/[slug].tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/posts/[slug]",
			},
		]
		const staticParams = new Map([["_root_/posts/[slug]", [{ slug: "hello" }]]])
		const result = buildPrerenderRoutes(defs, staticParams)
		expect(result).toHaveLength(2)
		expect(result[0]?.pathname).toBe("/about")
		expect(result[1]?.pathname).toBe("/posts/hello")
	})
})

/* ── writePrerenderOutput ────────────────────────────────────────── */

describe("writePrerenderOutput", () => {
	it("builds manifest JSON from entries", () => {
		const entries: PrerenderManifestEntry[] = [
			{
				headers: { "content-type": "text/html" },
				html: "<html>About</html>",
				mode: "static",
				ndjson: '{"t":"d"}\n',
				pathname: "/about",
			},
			{
				headers: { "content-type": "text/html" },
				html: "<html>Pricing</html>",
				mode: "isr",
				ndjson: '{"t":"d"}\n',
				pathname: "/pricing",
				revalidate: 300,
			},
		]

		const result = writePrerenderOutput(entries)

		expect(result.manifest).toHaveLength(2)
		expect(result.manifest[0]?.pathname).toBe("/about")
		expect(result.manifest[0]?.mode).toBe("static")
		expect(result.manifest[1]?.pathname).toBe("/pricing")
		expect(result.manifest[1]?.mode).toBe("isr")
		expect(result.manifest[1]?.revalidate).toBe(300)
	})

	it("builds file entries for each route", () => {
		const entries: PrerenderManifestEntry[] = [
			{
				headers: { "content-type": "text/html" },
				html: "<html>About</html>",
				mode: "static",
				ndjson: '{"t":"d"}\n',
				pathname: "/about",
			},
		]

		const result = writePrerenderOutput(entries)

		expect(result.files).toHaveLength(3)
		/* HTML file */
		const htmlFile = result.files.find((f) => f.path.endsWith(".html"))
		expect(htmlFile?.path).toBe("/about.html")
		expect(htmlFile?.content).toBe("<html>About</html>")
		/* NDJSON file */
		const ndjsonFile = result.files.find((f) => f.path.endsWith(".ndjson"))
		expect(ndjsonFile?.path).toBe("/about.ndjson")
		expect(ndjsonFile?.content).toBe('{"t":"d"}\n')
		/* Headers JSON */
		const headersFile = result.files.find((f) => f.path.endsWith(".headers.json"))
		expect(headersFile?.path).toBe("/about.headers.json")
	})

	it("handles root path (/ → index.html)", () => {
		const entries: PrerenderManifestEntry[] = [
			{
				headers: {},
				html: "<html>Home</html>",
				mode: "static",
				ndjson: "",
				pathname: "/",
			},
		]

		const result = writePrerenderOutput(entries)
		const htmlFile = result.files.find((f) => f.path.endsWith(".html"))
		expect(htmlFile?.path).toBe("/index.html")
	})
})
