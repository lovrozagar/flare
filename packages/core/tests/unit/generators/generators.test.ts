import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
	buildRouteTree,
	computeParentLayouts,
	extractCacheFromChain,
	extractInterceptFromChain,
	extractParamsFromPattern,
	extractRouteDefinitions,
	generateLayoutsRecord,
	generateRouteRegistry,
	generateRoutesFile,
	type RouteDefinition,
	runGenerate,
	scanSourceFiles,
	serializeTreeNode,
	validateRouteDefinitions,
} from "../../../src/generators/index.ts"

/* ── extractCacheFromChain ─────────────────────────────────────────── */

describe("extractCacheFromChain", () => {
	it("client.staleTime extracted", () => {
		const c = extractCacheFromChain(".cache({ client: { staleTime: 30000 } })")
		expect(c.client?.staleTime).toBe(30000)
	})

	it("client.gcTime extracted", () => {
		const c = extractCacheFromChain(".cache({ client: { gcTime: 60000 } })")
		expect(c.client?.gcTime).toBe(60000)
	})

	it("client with both staleTime and gcTime", () => {
		const c = extractCacheFromChain(".cache({ client: { staleTime: 30000, gcTime: 60000 } })")
		expect(c.client?.staleTime).toBe(30000)
		expect(c.client?.gcTime).toBe(60000)
	})

	it("prefetch: hover extracted from client", () => {
		const c = extractCacheFromChain(`.cache({ client: { prefetch: "intent" } })`)
		expect(c.client?.prefetch).toBe("intent")
	})

	it("prefetch: viewport extracted from client", () => {
		const c = extractCacheFromChain(`.cache({ client: { prefetch: "viewport" } })`)
		expect(c.client?.prefetch).toBe("viewport")
	})

	it("prefetch: false extracted from client", () => {
		const c = extractCacheFromChain(".cache({ client: { prefetch: false } })")
		expect(c.client?.prefetch).toBe(false)
	})

	it("combined client timing + prefetch", () => {
		const c = extractCacheFromChain(
			`.cache({ client: { staleTime: 30000, gcTime: 60000, prefetch: "intent" } })`,
		)
		expect(c.client?.staleTime).toBe(30000)
		expect(c.client?.gcTime).toBe(60000)
		expect(c.client?.prefetch).toBe("intent")
	})

	it("prefetchStaleTime + prefetchGcTime extracted", () => {
		const c = extractCacheFromChain(
			".cache({ client: { prefetchStaleTime: 10000, prefetchGcTime: 5000 } })",
		)
		expect(c.client?.prefetchStaleTime).toBe(10000)
		expect(c.client?.prefetchGcTime).toBe(5000)
	})

	it("numeric separators in staleTime", () => {
		const c = extractCacheFromChain(".cache({ client: { staleTime: 60_000 } })")
		expect(c.client?.staleTime).toBe(60000)
	})

	it("numeric separators in gcTime", () => {
		const c = extractCacheFromChain(".cache({ client: { gcTime: 1_000_000 } })")
		expect(c.client?.gcTime).toBe(1000000)
	})

	it("client.cacheDeferred: true extracted", () => {
		const c = extractCacheFromChain(".cache({ client: { cacheDeferred: true } })")
		expect(c.client?.cacheDeferred).toBe(true)
	})

	it("client.cacheDeferred: false not extracted (opt-in only)", () => {
		const c = extractCacheFromChain(".cache({ client: { cacheDeferred: false } })")
		expect(c.client?.cacheDeferred).toBeUndefined()
	})

	it("cacheDeferred combined with other client fields", () => {
		const c = extractCacheFromChain(
			`.cache({ client: { cacheDeferred: true, staleTime: 30000, prefetch: "intent" } })`,
		)
		expect(c.client?.cacheDeferred).toBe(true)
		expect(c.client?.staleTime).toBe(30000)
		expect(c.client?.prefetch).toBe("intent")
	})

	it("no .cache() call → empty", () => {
		const c = extractCacheFromChain(".authenticate().loader(() => {})")
		expect(c).toEqual({})
	})

	it("empty .cache({}) → empty", () => {
		const c = extractCacheFromChain(".cache({})")
		expect(c).toEqual({})
	})

	/* ── ssg extraction ── */

	it("ssg: true extracted", () => {
		const c = extractCacheFromChain(".cache({ ssg: true })")
		expect(c.ssg).toBe(true)
	})

	it("ssg: async callback → dynamic marker", () => {
		const c = extractCacheFromChain(".cache({ ssg: async () => fetchSlugs() })")
		expect(c.ssg).toBe("dynamic")
	})

	it("ssg: sync callback → dynamic marker", () => {
		const c = extractCacheFromChain(`.cache({ ssg: () => [{ slug: "a" }] })`)
		expect(c.ssg).toBe("dynamic")
	})

	it("ssg: true with client config → both present", () => {
		const c = extractCacheFromChain(".cache({ ssg: true, client: { staleTime: 5000 } })")
		expect(c.ssg).toBe(true)
		expect(c.client?.staleTime).toBe(5000)
	})

	it("client only, no ssg/isr → both undefined", () => {
		const c = extractCacheFromChain(".cache({ client: { staleTime: 5000 } })")
		expect(c.ssg).toBeUndefined()
		expect(c.isr).toBeUndefined()
	})

	it("ssg: { defer: 'stream' } → true + ssgDefer", () => {
		const c = extractCacheFromChain(`.cache({ ssg: { defer: "stream" } })`)
		expect(c.ssg).toBe(true)
		expect(c.ssgDefer).toBe("stream")
	})

	it("ssg: { params: () => [...] } → dynamic", () => {
		const c = extractCacheFromChain(`.cache({ ssg: { params: () => [{ id: "1" }] } })`)
		expect(c.ssg).toBe("dynamic")
	})

	it("ssg: { defer: 'resolve' } → true + ssgDefer", () => {
		const c = extractCacheFromChain(`.cache({ ssg: { defer: "resolve" } })`)
		expect(c.ssg).toBe(true)
		expect(c.ssgDefer).toBe("resolve")
	})

	/* ── isr extraction ── */

	it("isr: { revalidate: 300 } → isr true", () => {
		const c = extractCacheFromChain(".cache({ isr: { revalidate: 300 } })")
		expect(c.isr).toBe(true)
		expect(c.isrRevalidate).toBe(300)
	})

	it("isr: { params: () => [...], revalidate: 60 } → isr dynamic", () => {
		const c = extractCacheFromChain(
			`.cache({ isr: { params: async () => [{ slug: "a" }], revalidate: 60 } })`,
		)
		expect(c.isr).toBe("dynamic")
		expect(c.isrRevalidate).toBe(60)
	})

	it("isr: { defer: 'resolve', revalidate: 120 } → isr + isrDefer", () => {
		const c = extractCacheFromChain(`.cache({ isr: { defer: "resolve", revalidate: 120 } })`)
		expect(c.isr).toBe(true)
		expect(c.isrDefer).toBe("resolve")
		expect(c.isrRevalidate).toBe(120)
	})

	it("isr: { dynamicParams: false } extracted", () => {
		const c = extractCacheFromChain(
			".cache({ isr: { dynamicParams: false, params: () => [], revalidate: 60 } })",
		)
		expect(c.isrDynamicParams).toBe(false)
	})

	it("isr: { dynamicParams: true } extracted", () => {
		const c = extractCacheFromChain(
			".cache({ isr: { dynamicParams: true, params: () => [], revalidate: 60 } })",
		)
		expect(c.isrDynamicParams).toBe(true)
	})

	it("numeric with underscores: isr revalidate: 86_400", () => {
		const c = extractCacheFromChain(".cache({ isr: { revalidate: 86_400 } })")
		expect(c.isrRevalidate).toBe(86400)
	})

	/* ── isr: true (on-demand) ── */

	it("isr: true → on-demand ISR, no revalidate", () => {
		const c = extractCacheFromChain(".cache({ isr: true })")
		expect(c.isr).toBe(true)
		expect(c.isrRevalidate).toBeUndefined()
	})

	it("isr: true with client config → both present", () => {
		const c = extractCacheFromChain(".cache({ isr: true, client: { staleTime: 5000 } })")
		expect(c.isr).toBe(true)
		expect(c.isrRevalidate).toBeUndefined()
		expect(c.client?.staleTime).toBe(5000)
	})

	it("isr: { } without revalidate → isr true, no revalidate", () => {
		const c = extractCacheFromChain(`.cache({ isr: { defer: "stream" } })`)
		expect(c.isr).toBe(true)
		expect(c.isrRevalidate).toBeUndefined()
		expect(c.isrDefer).toBe("stream")
	})

	it("isr: { params } without revalidate → isr dynamic, no revalidate", () => {
		const c = extractCacheFromChain(`.cache({ isr: { params: () => [{ slug: "a" }] } })`)
		expect(c.isr).toBe("dynamic")
		expect(c.isrRevalidate).toBeUndefined()
	})

	/* ── duration string shorthands ── */

	it("client.staleTime: duration string → milliseconds", () => {
		const c = extractCacheFromChain(`.cache({ client: { staleTime: "5m" } })`)
		expect(c.client?.staleTime).toBe(300000)
	})

	it("client.gcTime: duration string → milliseconds", () => {
		const c = extractCacheFromChain(`.cache({ client: { gcTime: "1h" } })`)
		expect(c.client?.gcTime).toBe(3600000)
	})

	it("client.prefetchStaleTime: duration string → milliseconds", () => {
		const c = extractCacheFromChain(`.cache({ client: { prefetchStaleTime: "30s" } })`)
		expect(c.client?.prefetchStaleTime).toBe(30000)
	})

	it("client.prefetchGcTime: duration string → milliseconds", () => {
		const c = extractCacheFromChain(`.cache({ client: { prefetchGcTime: "2m" } })`)
		expect(c.client?.prefetchGcTime).toBe(120000)
	})

	it("isr revalidate: duration string → seconds", () => {
		const c = extractCacheFromChain(`.cache({ isr: { revalidate: "1h" } })`)
		expect(c.isr).toBe(true)
		expect(c.isrRevalidate).toBe(3600)
	})

	it("isr revalidate: duration string '1d' → seconds", () => {
		const c = extractCacheFromChain(`.cache({ isr: { revalidate: "1d" } })`)
		expect(c.isrRevalidate).toBe(86400)
	})

	it("mixed: duration string client + numeric isr revalidate", () => {
		const c = extractCacheFromChain(
			`.cache({ client: { staleTime: "10m" }, isr: { revalidate: 3600 } })`,
		)
		expect(c.client?.staleTime).toBe(600000)
		expect(c.isrRevalidate).toBe(3600)
	})

	it("mixed: numeric client + duration string isr revalidate", () => {
		const c = extractCacheFromChain(
			`.cache({ client: { staleTime: 30000 }, isr: { revalidate: "5m" } })`,
		)
		expect(c.client?.staleTime).toBe(30000)
		expect(c.isrRevalidate).toBe(300)
	})

	it("duration string with single quotes", () => {
		const c = extractCacheFromChain(`.cache({ client: { staleTime: '5m' } })`)
		expect(c.client?.staleTime).toBe(300000)
	})
})

/* ── extractRouteDefinitions ─────────────────────────────────────────── */

describe("extractRouteDefinitions", () => {
	it("createPage with virtualPath → extracted", () => {
		const src = `export const HomePage = createPage("_root_/")`
		const defs = extractRouteDefinitions(src, "routes/home.ts")
		expect(defs).toHaveLength(1)
		expect(defs[0]?.exportName).toBe("HomePage")
		expect(defs[0]?.virtualPath).toBe("_root_/")
		expect(defs[0]?.type).toBe("page")
	})

	it("createLayout with virtualPath → extracted", () => {
		const src = `export const ShopLayout = createLayout("_root_/(shop)")`
		const defs = extractRouteDefinitions(src, "routes/shop.ts")
		expect(defs).toHaveLength(1)
		expect(defs[0]?.type).toBe("layout")
	})

	it("createRootLayout with virtualPath → extracted", () => {
		const src = `export const RootLayout = createRootLayout("_root_")`
		const defs = extractRouteDefinitions(src, "routes/_root_.ts")
		expect(defs).toHaveLength(1)
		expect(defs[0]?.type).toBe("root-layout")
	})

	it("named export detected", () => {
		const src = `export const MyPage = createPage("_root_/about")`
		const defs = extractRouteDefinitions(src, "routes/about.ts")
		expect(defs[0]?.exportName).toBe("MyPage")
	})

	it("generic type params → virtualPath still extracted", () => {
		const src = `export const ProductPage = createPage<{ id: string }>("_root_/products/[id]")`
		const defs = extractRouteDefinitions(src, "routes/products.ts")
		expect(defs[0]?.virtualPath).toBe("_root_/products/[id]")
	})

	it("multiple routes in one file → all extracted", () => {
		const src = [
			`export const PageA = createPage("_root_/a")`,
			`export const PageB = createPage("_root_/b")`,
		].join("\n")
		const defs = extractRouteDefinitions(src, "routes/multi.ts")
		expect(defs).toHaveLength(2)
	})

	it("double-quoted virtualPath → extracted", () => {
		const src = `export const P = createPage("_root_/x")`
		const defs = extractRouteDefinitions(src, "f.ts")
		expect(defs[0]?.virtualPath).toBe("_root_/x")
	})

	it("single-quoted virtualPath → extracted", () => {
		const src = `export const P = createPage('_root_/y')`
		const defs = extractRouteDefinitions(src, "f.ts")
		expect(defs[0]?.virtualPath).toBe("_root_/y")
	})

	it("backtick virtualPath → extracted", () => {
		const src = "export const P = createPage(`_root_/z`)"
		const defs = extractRouteDefinitions(src, "f.ts")
		expect(defs[0]?.virtualPath).toBe("_root_/z")
	})

	it("no routes → empty array", () => {
		const src = "const x = 42"
		const defs = extractRouteDefinitions(src, "f.ts")
		expect(defs).toEqual([])
	})

	it(".cache() → cache populated", () => {
		const src = `export const P = createPage("_root_/x").cache({ client: { staleTime: 30000, prefetch: "intent" } })`
		const defs = extractRouteDefinitions(src, "f.ts")
		expect(defs[0]?.cache.client?.prefetch).toBe("intent")
		expect(defs[0]?.cache.client?.staleTime).toBe(30000)
	})

	it(".authenticate() detection", () => {
		const src = `export const P = createPage("_root_/x").authenticate()`
		const defs = extractRouteDefinitions(src, "f.ts")
		expect(defs[0]?.authenticateMode).toBe(true)
	})

	it(".authenticateOptional() detection", () => {
		const src = `export const P = createPage("_root_/x").authenticateOptional()`
		const defs = extractRouteDefinitions(src, "f.ts")
		expect(defs[0]?.authenticateMode).toBe("optional")
	})

	it(".authenticateOptional() wins over .authenticate() regex overlap", () => {
		const src = `export const P = createPage("_root_/x").authenticateOptional("role")`
		const defs = extractRouteDefinitions(src, "f.ts")
		expect(defs[0]?.authenticateMode).toBe("optional")
	})

	it("chain scope: authenticate vs authenticateOptional on different pages", () => {
		const src = [
			`export const PageA = createPage("_root_/a").authenticate()`,
			`export const PageB = createPage("_root_/b").authenticateOptional()`,
		].join("\n")
		const defs = extractRouteDefinitions(src, "f.ts")
		expect(defs[0]?.authenticateMode).toBe(true)
		expect(defs[1]?.authenticateMode).toBe("optional")
	})

	it(".response() detection → type x", () => {
		const src = `export const ApiRoute = createPage("_root_/api/data").response()`
		const defs = extractRouteDefinitions(src, "f.ts")
		expect(defs[0]?.responseRoute).toBe(true)
	})

	it("chain scope: two pages, cache only on first", () => {
		const src = [
			`export const PageA = createPage("_root_/a").cache({ client: { staleTime: 5000 } }).authenticate()`,
			`export const PageB = createPage("_root_/b")`,
		].join("\n")
		const defs = extractRouteDefinitions(src, "f.ts")
		expect(defs[0]?.cache.client?.staleTime).toBe(5000)
		expect(defs[0]?.authenticateMode).toBe(true)
		expect(defs[1]?.cache).toEqual({})
		expect(defs[1]?.authenticateMode).toBe(false)
	})

	it("chain scope: authenticate only on second page", () => {
		const src = [
			`export const PageA = createPage("_root_/a")`,
			`export const PageB = createPage("_root_/b").authenticate()`,
		].join("\n")
		const defs = extractRouteDefinitions(src, "f.ts")
		expect(defs[0]?.authenticateMode).toBe(false)
		expect(defs[1]?.authenticateMode).toBe(true)
	})

	it(".input() detection → hasInput: true", () => {
		const src = `export const P = createPage("_root_/products").input({ searchParams: z.object({ page: z.number() }) })`
		const defs = extractRouteDefinitions(src, "f.ts")
		expect(defs[0]?.hasInput).toBe(true)
	})

	it(".input<T>() detection → hasInput: true", () => {
		const src = `export const P = createPage("_root_/products").input<{ page: number }>({ searchParams: z.object({ page: z.number() }) })`
		const defs = extractRouteDefinitions(src, "f.ts")
		expect(defs[0]?.hasInput).toBe(true)
	})

	it("no .input() → hasInput: false", () => {
		const src = `export const P = createPage("_root_/about")`
		const defs = extractRouteDefinitions(src, "f.ts")
		expect(defs[0]?.hasInput).toBe(false)
	})

	it("chain scope: input only on first page", () => {
		const src = [
			`export const PageA = createPage("_root_/a").input({ searchParams: z.object({}) })`,
			`export const PageB = createPage("_root_/b")`,
		].join("\n")
		const defs = extractRouteDefinitions(src, "f.ts")
		expect(defs[0]?.hasInput).toBe(true)
		expect(defs[1]?.hasInput).toBe(false)
	})
})

/* ── validateRouteDefinitions ────────────────────────────────────────── */

function makeDef(overrides: Partial<RouteDefinition>): RouteDefinition {
	return {
		authenticateMode: false,
		cache: {},
		exportName: "P",
		filePath: "f.ts",
		hasInput: false,
		responseRoute: false,
		type: "page",
		virtualPath: "_root_/x",
		...overrides,
	}
}

describe("validateRouteDefinitions", () => {
	it("duplicate virtualPaths → error", () => {
		const defs = [
			makeDef({ exportName: "A", filePath: "a.ts", virtualPath: "_root_/x" }),
			makeDef({ exportName: "B", filePath: "b.ts", virtualPath: "_root_/x" }),
		]
		const errors = validateRouteDefinitions(defs)
		expect(errors.length).toBeGreaterThan(0)
		expect(errors[0]).toContain("Duplicate")
	})

	it("valid paths → no errors", () => {
		const defs = [
			makeDef({ exportName: "A", filePath: "a.ts", virtualPath: "_root_/about" }),
			makeDef({ exportName: "B", filePath: "b.ts", type: "layout", virtualPath: "_root_/(shop)" }),
		]
		const errors = validateRouteDefinitions(defs)
		expect(errors).toHaveLength(0)
	})

	it("unique paths → no error", () => {
		const defs = [
			makeDef({ exportName: "A", filePath: "a.ts", virtualPath: "_root_/a" }),
			makeDef({ exportName: "B", filePath: "b.ts", virtualPath: "_root_/b" }),
		]
		const errors = validateRouteDefinitions(defs)
		expect(errors).toHaveLength(0)
	})

	it("pre-root: group before root → error", () => {
		const defs = [makeDef({ virtualPath: "(auth)/_root_/login" })]
		const errors = validateRouteDefinitions(defs)
		expect(errors.length).toBeGreaterThan(0)
		expect(errors[0]).toContain("pre-root")
	})

	it("pre-root: static segment before root → error", () => {
		const defs = [makeDef({ virtualPath: "foo/_root_/page" })]
		const errors = validateRouteDefinitions(defs)
		expect(errors.length).toBeGreaterThan(0)
		expect(errors[0]).toContain("pre-root")
	})

	it("pre-root: param segments before root → no error", () => {
		const defs = [makeDef({ virtualPath: "[locale]/_root_/about" })]
		const errors = validateRouteDefinitions(defs)
		expect(errors).toHaveLength(0)
	})

	it("pre-root: multiple param segments before root → no error", () => {
		const defs = [makeDef({ virtualPath: "[locale]/[tenant]/_root_/page" })]
		const errors = validateRouteDefinitions(defs)
		expect(errors).toHaveLength(0)
	})
})

/* ── extractRouteDefinitions — createPathSegment ─────────────────────── */

describe("extractRouteDefinitions — createPathSegment", () => {
	it("detects createPathSegment", () => {
		const src = `export const locale = createPathSegment("_root_/[locale]")`
		const defs = extractRouteDefinitions(src, "f.ts")
		expect(defs).toHaveLength(1)
		expect(defs[0].type).toBe("path-segment")
		expect(defs[0].virtualPath).toBe("_root_/[locale]")
		expect(defs[0].exportName).toBe("locale")
	})

	it("detects createPathSegment with generic", () => {
		const src = `export const seg = createPathSegment<"_root_/[id]">("_root_/[id]")`
		const defs = extractRouteDefinitions(src, "f.ts")
		expect(defs).toHaveLength(1)
		expect(defs[0].type).toBe("path-segment")
	})

	it("detects createPathSegment alongside pages", () => {
		const src = [
			`export const locale = createPathSegment("_root_/[locale]")`,
			`export const home = createPage("_root_/[locale]/")`,
		].join("\n")
		const defs = extractRouteDefinitions(src, "f.ts")
		expect(defs).toHaveLength(2)
		expect(defs.find((d) => d.type === "path-segment")).toBeDefined()
		expect(defs.find((d) => d.type === "page")).toBeDefined()
	})
})

/* ── generateLayoutsRecord — path-segments ─────────────────────────── */

describe("generateLayoutsRecord — path-segments", () => {
	it("includes path-segments in layouts record", () => {
		const defs: RouteDefinition[] = [
			makeDef({
				exportName: "RootLayout",
				filePath: "routes/_root_.ts",
				type: "root-layout",
				virtualPath: "_root_",
			}),
			makeDef({
				exportName: "locale",
				filePath: "routes/locale.ts",
				type: "path-segment",
				virtualPath: "_root_/[locale]",
			}),
		]
		const code = generateLayoutsRecord(defs, "src/_gen")
		expect(code).toContain('"_root_"')
		expect(code).toContain('"_root_/[locale]"')
		expect(code).toContain("locale")
	})
})

/* ── buildRouteTree + serializeTreeNode ──────────────────────────────── */

describe("buildRouteTree", () => {
	it("empty routes → empty root", () => {
		const tree = buildRouteTree([])
		expect(tree.s).toEqual({})
		expect(tree.routeKey).toBeUndefined()
	})

	it("root route → routeKey on root node", () => {
		const tree = buildRouteTree([{ routeKey: "R0", urlPattern: "/" }])
		expect(tree.routeKey).toBe("R0")
	})

	it("static route → nested in s", () => {
		const tree = buildRouteTree([{ routeKey: "R0", urlPattern: "/about" }])
		expect(tree.s.about?.routeKey).toBe("R0")
	})

	it("param route → nested in p", () => {
		const tree = buildRouteTree([{ routeKey: "R0", urlPattern: "/users/[id]" }])
		expect(tree.s.users?.p?.n).toBe("id")
		expect(tree.s.users?.p?.routeKey).toBe("R0")
	})

	it("catch-all → nested in c", () => {
		const tree = buildRouteTree([{ routeKey: "R0", urlPattern: "/docs/[...slug]" }])
		expect(tree.s.docs?.c?.n).toBe("slug")
		expect(tree.s.docs?.c?.routeKey).toBe("R0")
	})

	it("optional catch-all → nested in o", () => {
		const tree = buildRouteTree([{ routeKey: "R0", urlPattern: "/locale/[[...lang]]" }])
		expect(tree.s.locale?.o?.n).toBe("lang")
		expect(tree.s.locale?.o?.routeKey).toBe("R0")
	})

	it("multiple routes share trie structure", () => {
		const tree = buildRouteTree([
			{ routeKey: "R0", urlPattern: "/blog" },
			{ routeKey: "R1", urlPattern: "/blog/[slug]" },
		])
		expect(tree.s.blog?.routeKey).toBe("R0")
		expect(tree.s.blog?.p?.routeKey).toBe("R1")
	})
})

describe("serializeTreeNode", () => {
	it("empty node → { s: E }", () => {
		expect(serializeTreeNode({ s: {} })).toBe("{ s: E }")
	})

	it("node with route → { r: R0, s: E }", () => {
		expect(serializeTreeNode({ routeKey: "R0", s: {} })).toBe("{ r: R0, s: E }")
	})

	it("node with static child → S() wrapper", () => {
		const node = { s: { about: { routeKey: "R0", s: {} } } }
		expect(serializeTreeNode(node)).toBe("{ s: S({ about: { r: R0, s: E } }) }")
	})

	it("node with param child", () => {
		const node = { p: { n: "id", routeKey: "R0", s: {} }, s: {} }
		expect(serializeTreeNode(node)).toBe(`{ p: { n: "id", r: R0, s: E }, s: E }`)
	})

	it("node with catch-all child", () => {
		const node = { c: { n: "slug", routeKey: "R0", s: {} }, s: {} }
		expect(serializeTreeNode(node)).toBe(`{ c: { n: "slug", r: R0, s: E }, s: E }`)
	})

	it("hyphenated keys are quoted", () => {
		const node = { s: { "cache-test": { routeKey: "R0", s: {} } } }
		expect(serializeTreeNode(node)).toBe(`{ s: S({ "cache-test": { r: R0, s: E } }) }`)
	})

	it("nested tree serializes correctly", () => {
		const tree = buildRouteTree([
			{ routeKey: "R0", urlPattern: "/" },
			{ routeKey: "R1", urlPattern: "/about" },
		])
		const result = serializeTreeNode(tree)
		expect(result).toContain("r: R0")
		expect(result).toContain("about: { r: R1, s: E }")
		expect(result).toContain("S({")
	})
})

/* ── generateRoutesFile — route declarations ─────────────────────────── */

describe("generateRoutesFile — route declarations", () => {
	it("page → route declaration with correct fields", () => {
		const defs: RouteDefinition[] = [
			makeDef({
				exportName: "HomePage",
				filePath: "routes/home.ts",
				virtualPath: "_root_/",
			}),
		]
		const code = generateRoutesFile(defs, "src/_gen")
		expect(code).toContain("const R0: RouteData")
		expect(code).toContain('"_root_/"')
		expect(code).toContain("HomePage")
		expect(code).toContain('t: "r"')
	})

	it("response route → t: x", () => {
		const defs: RouteDefinition[] = [
			makeDef({
				exportName: "ApiRoute",
				filePath: "routes/api.ts",
				responseRoute: true,
				virtualPath: "_root_/api/data",
			}),
		]
		const code = generateRoutesFile(defs, "src/_gen")
		expect(code).toContain('t: "x"')
	})

	it("authenticate → meta includes authenticate: true", () => {
		const defs: RouteDefinition[] = [
			makeDef({
				authenticateMode: true,
				exportName: "P",
				filePath: "routes/p.ts",
				virtualPath: "_root_/p",
			}),
		]
		const code = generateRoutesFile(defs, "src/_gen")
		expect(code).toContain("authenticate: true")
	})

	it("cache → meta includes client with prefetch", () => {
		const defs: RouteDefinition[] = [
			makeDef({
				cache: { client: { prefetch: "intent", staleTime: 30000 } },
				exportName: "P",
				filePath: "routes/p.ts",
				virtualPath: "_root_/p",
			}),
		]
		const code = generateRoutesFile(defs, "src/_gen")
		expect(code).toContain("staleTime: 30000")
		expect(code).toContain(`prefetch: "intent"`)
	})

	it("cache → meta includes client gcTime", () => {
		const defs: RouteDefinition[] = [
			makeDef({
				cache: { client: { gcTime: 60000 } },
				exportName: "P",
				filePath: "routes/p.ts",
				virtualPath: "_root_/p",
			}),
		]
		const code = generateRoutesFile(defs, "src/_gen")
		expect(code).toContain("client: { gcTime: 60000 }")
	})

	it("prefetch: false → meta includes prefetch: false", () => {
		const defs: RouteDefinition[] = [
			makeDef({
				cache: { client: { prefetch: false } },
				exportName: "P",
				filePath: "routes/p.ts",
				virtualPath: "_root_/p",
			}),
		]
		const code = generateRoutesFile(defs, "src/_gen")
		expect(code).toContain("prefetch: false")
	})

	it("cache → meta includes prefetchStaleTime", () => {
		const defs: RouteDefinition[] = [
			makeDef({
				cache: { client: { prefetchStaleTime: 10000 } },
				exportName: "P",
				filePath: "routes/p.ts",
				virtualPath: "_root_/p",
			}),
		]
		const code = generateRoutesFile(defs, "src/_gen")
		expect(code).toContain("prefetchStaleTime: 10000")
	})

	it("cache → meta includes prefetchGcTime", () => {
		const defs: RouteDefinition[] = [
			makeDef({
				cache: { client: { prefetchGcTime: 5000 } },
				exportName: "P",
				filePath: "routes/p.ts",
				virtualPath: "_root_/p",
			}),
		]
		const code = generateRoutesFile(defs, "src/_gen")
		expect(code).toContain("prefetchGcTime: 5000")
	})

	it("cache → meta includes cacheDeferred: true", () => {
		const defs: RouteDefinition[] = [
			makeDef({
				cache: { client: { cacheDeferred: true } },
				exportName: "P",
				filePath: "routes/p.ts",
				virtualPath: "_root_/p",
			}),
		]
		const code = generateRoutesFile(defs, "src/_gen")
		expect(code).toContain("cacheDeferred: true")
	})

	it("cache → meta includes all 6 client fields", () => {
		const defs: RouteDefinition[] = [
			makeDef({
				cache: {
					client: {
						cacheDeferred: true,
						gcTime: 60000,
						prefetch: "viewport",
						prefetchGcTime: 5000,
						prefetchStaleTime: 10000,
						staleTime: 30000,
					},
				},
				exportName: "P",
				filePath: "routes/p.ts",
				virtualPath: "_root_/p",
			}),
		]
		const code = generateRoutesFile(defs, "src/_gen")
		expect(code).toContain("cacheDeferred: true")
		expect(code).toContain("staleTime: 30000")
		expect(code).toContain("gcTime: 60000")
		expect(code).toContain(`prefetch: "viewport"`)
		expect(code).toContain("prefetchStaleTime: 10000")
		expect(code).toContain("prefetchGcTime: 5000")
	})

	it("combined authenticate + cache", () => {
		const defs: RouteDefinition[] = [
			makeDef({
				authenticateMode: true,
				cache: { client: { staleTime: 5000 } },
				exportName: "P",
				filePath: "routes/p.ts",
				virtualPath: "_root_/p",
			}),
		]
		const code = generateRoutesFile(defs, "src/_gen")
		expect(code).toContain("authenticate: true")
		expect(code).toContain("client: { staleTime: 5000 }")
	})

	it("meta deduplication — shared empty meta uses single O0", () => {
		const defs: RouteDefinition[] = [
			makeDef({ exportName: "A", filePath: "routes/a.ts", virtualPath: "_root_/a" }),
			makeDef({ exportName: "B", filePath: "routes/b.ts", virtualPath: "_root_/b" }),
		]
		const code = generateRoutesFile(defs, "src/_gen")
		expect(code).toContain("const O0 = {}")
		expect(code).not.toContain("const O1")
		expect(code).toContain("o: O0,")
	})
})

/* ── generateLayoutsRecord ───────────────────────────────────────────── */

describe("generateLayoutsRecord", () => {
	it("layouts exported as lazy loader record", () => {
		const defs: RouteDefinition[] = [
			makeDef({
				exportName: "RootLayout",
				filePath: "routes/_root_.ts",
				type: "root-layout",
				virtualPath: "_root_",
			}),
			makeDef({
				exportName: "ShopLayout",
				filePath: "routes/(shop).ts",
				type: "layout",
				virtualPath: "_root_/(shop)",
			}),
		]
		const code = generateLayoutsRecord(defs, "src/_gen")
		expect(code).toContain('"_root_"')
		expect(code).toContain('"_root_/(shop)"')
		expect(code).toContain("RootLayout")
		expect(code).toContain("ShopLayout")
	})

	it("no layouts → empty record", () => {
		const code = generateLayoutsRecord([], "src/_gen")
		expect(code).toContain("{}")
	})
})

/* ── generateRoutesFile ──────────────────────────────────────────────── */

describe("generateRoutesFile", () => {
	it("produces valid file with type imports and static tree", () => {
		const defs: RouteDefinition[] = [
			makeDef({
				exportName: "HomePage",
				filePath: "src/routes/home.ts",
				virtualPath: "_root_/",
			}),
		]
		const file = generateRoutesFile(defs, "src/_gen")
		expect(file).toContain("/* Auto-generated by flare — do not edit */")
		expect(file).toContain(`import type { RouteData, TreeNode } from "flare/codegen"`)
		expect(file).toContain("const E: Record<string, TreeNode> = Object.create(null)")
		expect(file).toContain("const R0: RouteData")
		expect(file).toContain("export const routeTree: TreeNode =")
		expect(file).not.toContain("createTreeNode")
		expect(file).not.toContain("insertRoute")
	})

	it("emits S helper only when tree has non-empty children", () => {
		const flat: RouteDefinition[] = [
			makeDef({ exportName: "A", filePath: "routes/a.ts", virtualPath: "_root_/a" }),
		]
		const flatFile = generateRoutesFile(flat, "src/_gen")
		expect(flatFile).toContain("function S(")

		const empty = generateRoutesFile([], "src/_gen")
		expect(empty).not.toContain("function S(")
	})

	it("includes layouts export", () => {
		const defs: RouteDefinition[] = [
			makeDef({
				exportName: "RootLayout",
				filePath: "src/routes/_root_.ts",
				type: "root-layout",
				virtualPath: "_root_",
			}),
			makeDef({
				exportName: "AboutPage",
				filePath: "src/routes/about.ts",
				virtualPath: "_root_/about",
			}),
		]
		const file = generateRoutesFile(defs, "src/_gen")
		expect(file).toContain("export const layouts")
		expect(file).toContain('"_root_"')
	})

	it("layouts-only defs → no RouteData import, no consecutive blank lines", () => {
		const defs: RouteDefinition[] = [
			makeDef({
				exportName: "RootLayout",
				filePath: "src/routes/_root_.ts",
				type: "root-layout",
				virtualPath: "_root_",
			}),
		]
		const file = generateRoutesFile(defs, "src/_gen")
		expect(file).not.toContain("RouteData")
		expect(file).not.toContain("\n\n\n")
		expect(file).toContain("export const routeTree: TreeNode =")
		expect(file).toContain("export const layouts")
	})

	it("empty defs → file with empty tree, no S helper, no unused imports", () => {
		const file = generateRoutesFile([], "src/_gen")
		expect(file).toContain("const E: Record<string, TreeNode> = Object.create(null)")
		expect(file).toContain("export const routeTree: TreeNode = { s: E }")
		expect(file).not.toContain("const R0")
		expect(file).not.toContain("function S(")
		expect(file).not.toContain("RouteData")
		expect(file).not.toContain("\n\n\n")
	})

	it("imports InferParams and InferSearchParams when routes have input", () => {
		const defs: RouteDefinition[] = [
			makeDef({
				exportName: "P",
				filePath: "src/routes/p.ts",
				hasInput: true,
				virtualPath: "_root_/p",
			}),
		]
		const file = generateRoutesFile(defs, "src/_gen")
		expect(file).toContain("InferParams")
		expect(file).toContain("InferSearchParams")
	})

	it("static tree contains route references", () => {
		const defs: RouteDefinition[] = [
			makeDef({
				exportName: "AboutPage",
				filePath: "src/routes/about.ts",
				virtualPath: "_root_/about",
			}),
			makeDef({
				exportName: "BlogPage",
				filePath: "src/routes/blog.ts",
				virtualPath: "_root_/blog",
			}),
		]
		const file = generateRoutesFile(defs, "src/_gen")
		expect(file).toContain("r: R0")
		expect(file).toContain("r: R1")
		expect(file).toContain("about:")
		expect(file).toContain("blog:")
	})
})

/* ── scanSourceFiles ─────────────────────────────────────────────────── */

describe("scanSourceFiles", () => {
	let tmpDir: string

	beforeEach(() => {
		tmpDir = join(tmpdir(), `flare-test-${Date.now()}`)
		mkdirSync(join(tmpDir, "src", "routes"), { recursive: true })
		mkdirSync(join(tmpDir, "src", "_gen"), { recursive: true })
		mkdirSync(join(tmpDir, "src", "node_modules", "pkg"), { recursive: true })
	})

	afterEach(() => {
		rmSync(tmpDir, { force: true, recursive: true })
	})

	it("finds .ts route files", () => {
		writeFileSync(
			join(tmpDir, "src", "routes", "home.ts"),
			`export const HomePage = createPage("_root_/")`,
		)
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(1)
		expect(defs[0]?.exportName).toBe("HomePage")
	})

	it("finds .tsx route files", () => {
		writeFileSync(
			join(tmpDir, "src", "routes", "about.tsx"),
			`export const AboutPage = createPage("_root_/about")`,
		)
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(1)
	})

	it("skips _gen/ directory", () => {
		writeFileSync(
			join(tmpDir, "src", "_gen", "routes.gen.ts"),
			`export const X = createPage("_root_/x")`,
		)
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(0)
	})

	it("skips node_modules", () => {
		writeFileSync(
			join(tmpDir, "src", "node_modules", "pkg", "index.ts"),
			`export const X = createPage("_root_/x")`,
		)
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(0)
	})

	it("skips *.gen.ts files", () => {
		writeFileSync(
			join(tmpDir, "src", "routes", "types.gen.ts"),
			`export const X = createPage("_root_/x")`,
		)
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(0)
	})

	it("skips dirs starting with ignorePrefix", () => {
		mkdirSync(join(tmpDir, "src", "__ignored"), { recursive: true })
		writeFileSync(
			join(tmpDir, "src", "__ignored", "test.ts"),
			`export const X = createPage("_root_/x")`,
		)
		const defs = scanSourceFiles({ ignorePrefix: "__", rootDir: tmpDir })
		expect(defs).toHaveLength(0)
	})

	it("nonexistent srcDir → empty array", () => {
		const defs = scanSourceFiles({ rootDir: join(tmpDir, "nope") })
		expect(defs).toEqual([])
	})
})

/* ── runGenerate ─────────────────────────────────────────────────────── */

describe("runGenerate", () => {
	let tmpDir: string

	beforeEach(() => {
		tmpDir = join(tmpdir(), `flare-gen-${Date.now()}`)
		mkdirSync(join(tmpDir, "src", "routes"), { recursive: true })
	})

	afterEach(() => {
		rmSync(tmpDir, { force: true, recursive: true })
	})

	it("generates routes.gen.ts from source files", () => {
		writeFileSync(
			join(tmpDir, "src", "routes", "home.ts"),
			`export const HomePage = createPage("_root_/")`,
		)
		writeFileSync(
			join(tmpDir, "src", "routes", "_root_.ts"),
			`export const RootLayout = createRootLayout("_root_")`,
		)

		const result = runGenerate({ rootDir: tmpDir })
		expect(result.routes).toBe(1)
		expect(result.layouts).toBe(1)

		const output = readFileSync(join(tmpDir, "src", "_gen", "routes.gen.ts"), "utf-8")
		expect(output).toContain("const R0: RouteData")
		expect(output).toContain("HomePage")
		expect(output).toContain("export const routeTree: TreeNode")
		expect(output).toContain("export const layouts")
	})

	it("throws on duplicate virtualPaths", () => {
		writeFileSync(
			join(tmpDir, "src", "routes", "a.ts"),
			`export const A = createPage("_root_/dup")`,
		)
		writeFileSync(
			join(tmpDir, "src", "routes", "b.ts"),
			`export const B = createPage("_root_/dup")`,
		)

		expect(() => runGenerate({ rootDir: tmpDir })).toThrow("Route validation failed")
	})

	it("custom outputPath respected", () => {
		writeFileSync(
			join(tmpDir, "src", "routes", "home.ts"),
			`export const HomePage = createPage("_root_/")`,
		)

		runGenerate({ outputPath: "src/generated/routes.gen.ts", rootDir: tmpDir })

		const output = readFileSync(join(tmpDir, "src", "generated", "routes.gen.ts"), "utf-8")
		expect(output).toContain("HomePage")
	})

	it("empty project → file with empty tree", () => {
		const result = runGenerate({ rootDir: tmpDir })
		expect(result.routes).toBe(0)
		expect(result.layouts).toBe(0)

		const output = readFileSync(join(tmpDir, "src", "_gen", "routes.gen.ts"), "utf-8")
		expect(output).toContain("export const routeTree: TreeNode = { s: E }")
	})
})

/* ── extractParamsFromPattern ────────────────────────────────────── */

describe("extractParamsFromPattern", () => {
	it("static path → empty array", () => {
		expect(extractParamsFromPattern("/")).toEqual([])
		expect(extractParamsFromPattern("/about")).toEqual([])
		expect(extractParamsFromPattern("/blog/posts")).toEqual([])
	})

	it("single param → string type", () => {
		expect(extractParamsFromPattern("/blog/[slug]")).toEqual([{ name: "slug", type: "string" }])
	})

	it("multiple params → sorted by name", () => {
		const result = extractParamsFromPattern("/users/[userId]/posts/[postId]")
		expect(result).toEqual([
			{ name: "postId", type: "string" },
			{ name: "userId", type: "string" },
		])
	})

	it("catch-all → string[] type", () => {
		expect(extractParamsFromPattern("/catch-all/[...segments]")).toEqual([
			{ name: "segments", type: "string[]" },
		])
	})

	it("optional catch-all → string[] | undefined type", () => {
		expect(extractParamsFromPattern("/locale/[[...locale]]")).toEqual([
			{ name: "locale", type: "string[] | undefined" },
		])
	})

	it("optional single param → string | undefined type", () => {
		expect(extractParamsFromPattern("/[[locale]]")).toEqual([
			{ name: "locale", type: "string | undefined" },
		])
	})

	it("optional single param with static children", () => {
		expect(extractParamsFromPattern("/[[locale]]/about")).toEqual([
			{ name: "locale", type: "string | undefined" },
		])
	})

	it("mixed with optional single param", () => {
		expect(extractParamsFromPattern("/[[locale]]/blog/[slug]")).toEqual([
			{ name: "locale", type: "string | undefined" },
			{ name: "slug", type: "string" },
		])
	})

	it("mixed param types", () => {
		expect(extractParamsFromPattern("/[org]/repos/[...path]")).toEqual([
			{ name: "org", type: "string" },
			{ name: "path", type: "string[]" },
		])
	})
})

/* ── generateRouteRegistry ──────────────────────────────────────── */

describe("generateRouteRegistry", () => {
	function makeDef(
		virtualPath: string,
		type: "layout" | "page" | "root-layout" = "page",
		responseRoute = false,
	): RouteDefinition {
		return {
			authenticateMode: false,
			cache: {},
			exportName: "route",
			filePath: `src/routes/${virtualPath}.tsx`,
			hasInput: false,
			responseRoute,
			type,
			virtualPath,
		}
	}

	it("empty defs → empty routes", () => {
		const result = generateRouteRegistry([], "src/_gen")
		expect(result).toContain("interface FlareRegister")
		expect(result).toContain("routes: {")
		/* No route entries */
		expect(result).not.toMatch(/"\/.+"/)
	})

	it("static route → entry with no params", () => {
		const result = generateRouteRegistry([makeDef("_root_/about")], "src/_gen")
		expect(result).toContain('"/about": {}')
	})

	it("parameterized route → params type", () => {
		const result = generateRouteRegistry([makeDef("_root_/blog/[slug]")], "src/_gen")
		expect(result).toContain('"/blog/[slug]": { params: { slug: string } }')
	})

	it("catch-all route → string[] param", () => {
		const result = generateRouteRegistry([makeDef("_root_/files/[...path]")], "src/_gen")
		expect(result).toContain('"/files/[...path]": { params: { path: string[] } }')
	})

	it("optional catch-all → string[] | undefined param", () => {
		const result = generateRouteRegistry([makeDef("_root_/locale/[[...locale]]")], "src/_gen")
		expect(result).toContain(
			'"/locale/[[...locale]]": { params: { locale: string[] | undefined } }',
		)
	})

	it("layouts excluded from routes section", () => {
		const result = generateRouteRegistry(
			[makeDef("_root_/(auth)", "layout"), makeDef("_root_/about")],
			"src/_gen",
		)
		expect(result).toContain('"/about"')
		/* layouts excluded from routes: {} but included in routeModules */
		const routesSection = result.split("routeModules:")[0] ?? ""
		expect(routesSection).not.toContain("(auth)")
	})

	it("response routes excluded", () => {
		const result = generateRouteRegistry(
			[makeDef("_root_/api/health", "page", true), makeDef("_root_/about")],
			"src/_gen",
		)
		expect(result).toContain('"/about"')
		expect(result).not.toContain("/api/health")
	})

	it("routes sorted by URL path", () => {
		const result = generateRouteRegistry(
			[makeDef("_root_/zebra"), makeDef("_root_/about"), makeDef("_root_/")],
			"src/_gen",
		)
		const routesSection = result.split("routeModules:")[0] ?? ""
		const lines = routesSection.split("\n").filter((l) => l.includes('"/'))
		const paths = lines.map((l) => l.trim().match(/"([^"]+)"/)?.[1])
		expect(paths).toEqual(["/", "/about", "/zebra"])
	})

	it("index route (trailing /) → /", () => {
		const result = generateRouteRegistry([makeDef("_root_/")], "src/_gen")
		expect(result).toContain('"/": {}')
	})

	it("multiple params sorted in type", () => {
		const result = generateRouteRegistry(
			[makeDef("_root_/users/[userId]/posts/[postId]")],
			"src/_gen",
		)
		expect(result).toContain("postId: string")
		expect(result).toContain("userId: string")
		/* postId before userId (alphabetical) in the params object */
		const line = result.split("\n").find((l) => l.includes("/users/"))
		expect(line).toBeDefined()
		const paramsSection = line?.split("params:")[1] ?? ""
		const postIdIdx = paramsSection.indexOf("postId")
		const userIdIdx = paramsSection.indexOf("userId")
		expect(postIdIdx).toBeLessThan(userIdIdx)
	})

	it("output is valid declare module augmentation", () => {
		const result = generateRouteRegistry([makeDef("_root_/about")], "src/_gen")
		expect(result).toContain('declare module "flare/codegen"')
		expect(result).toContain("interface FlareRegister")
	})

	it("emits routeModules with typeof imports for pages", () => {
		const defs = [makeDef("_root_/about")]
		const result = generateRouteRegistry(defs, "src/_gen")
		expect(result).toContain("routeModules:")
		expect(result).toContain('"_root_/about": typeof import("../routes/_root_/about")["route"]')
	})

	it("includes layouts in routeModules", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: {},
				exportName: "route",
				filePath: "src/routes/_root_.ts",
				hasInput: false,
				responseRoute: false,
				type: "root-layout",
				virtualPath: "_root_",
			},
			{
				authenticateMode: false,
				cache: {},
				exportName: "route",
				filePath: "src/routes/about.ts",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/about",
			},
		]
		const result = generateRouteRegistry(defs, "src/_gen")
		expect(result).toContain('"_root_": typeof import("../routes/_root_")["route"]')
	})

	it("excludes response routes from routeModules", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: {},
				exportName: "route",
				filePath: "src/routes/api.ts",
				hasInput: false,
				responseRoute: true,
				type: "page",
				virtualPath: "_root_/api",
			},
		]
		const result = generateRouteRegistry(defs, "src/_gen")
		expect(result).not.toContain("_root_/api")
	})

	it("emits routeParents with parent layout chains", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: {},
				exportName: "route",
				filePath: "src/routes/_root_.ts",
				hasInput: false,
				responseRoute: false,
				type: "root-layout",
				virtualPath: "_root_",
			},
			{
				authenticateMode: false,
				cache: {},
				exportName: "route",
				filePath: "src/routes/blog/_layout_.ts",
				hasInput: false,
				responseRoute: false,
				type: "layout",
				virtualPath: "_root_/(blog)",
			},
			{
				authenticateMode: false,
				cache: {},
				exportName: "route",
				filePath: "src/routes/blog/[slug].tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/(blog)/blog/[slug]",
			},
		]
		const result = generateRouteRegistry(defs, "src/_gen")
		expect(result).toContain("routeParents:")
		expect(result).toContain('"_root_/(blog)/blog/[slug]": ["_root_", "_root_/(blog)"]')
	})

	it("root layout has empty parents", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: {},
				exportName: "route",
				filePath: "src/routes/_root_.ts",
				hasInput: false,
				responseRoute: false,
				type: "root-layout",
				virtualPath: "_root_",
			},
			{
				authenticateMode: false,
				cache: {},
				exportName: "route",
				filePath: "src/routes/about.ts",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/about",
			},
		]
		const result = generateRouteRegistry(defs, "src/_gen")
		expect(result).toContain('"_root_": []')
	})

	it("page under root has root as only parent", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: {},
				exportName: "route",
				filePath: "src/routes/_root_.ts",
				hasInput: false,
				responseRoute: false,
				type: "root-layout",
				virtualPath: "_root_",
			},
			{
				authenticateMode: false,
				cache: {},
				exportName: "route",
				filePath: "src/routes/about.ts",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/about",
			},
		]
		const result = generateRouteRegistry(defs, "src/_gen")
		expect(result).toContain('"_root_/about": ["_root_"]')
	})

	it("routeModules sorted by virtualPath", () => {
		const defs = [makeDef("_root_/zebra"), makeDef("_root_/about")]
		const result = generateRouteRegistry(defs, "src/_gen")
		const moduleLines = result.split("\n").filter((l) => l.includes("typeof import"))
		const paths = moduleLines.map((l) => l.trim().match(/"([^"]+)":/)?.[1])
		expect(paths).toEqual(["_root_/about", "_root_/zebra"])
	})

	it("uses correct exportName in typeof import", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: {},
				exportName: "HomePage",
				filePath: "src/routes/home.ts",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/",
			},
		]
		const result = generateRouteRegistry(defs, "src/_gen")
		expect(result).toContain('typeof import("../routes/home")["HomePage"]')
	})

	it("emits authModes for authenticate routes", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: true,
				cache: {},
				exportName: "route",
				filePath: "src/routes/_root_.ts",
				hasInput: false,
				responseRoute: false,
				type: "root-layout",
				virtualPath: "_root_",
			},
			{
				authenticateMode: false,
				cache: {},
				exportName: "route",
				filePath: "src/routes/about.ts",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/about",
			},
		]
		const result = generateRouteRegistry(defs, "src/_gen")
		expect(result).toContain("authModes:")
		expect(result).toContain('"_root_": true')
		const authModesBlock = result.slice(result.indexOf("authModes:"))
		expect(authModesBlock).not.toContain("_root_/about")
	})

	it("emits authModes with optional mode", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: "optional",
				cache: {},
				exportName: "route",
				filePath: "src/routes/home.ts",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/",
			},
		]
		const result = generateRouteRegistry(defs, "src/_gen")
		expect(result).toContain("authModes:")
		expect(result).toContain('"_root_/": "optional"')
	})

	it("no authModes section when all routes have false mode", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: {},
				exportName: "route",
				filePath: "src/routes/about.ts",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/about",
			},
		]
		const result = generateRouteRegistry(defs, "src/_gen")
		expect(result).not.toContain("authModes:")
	})

	it("emits routeSearchParams for pages with hasInput", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: {},
				exportName: "route",
				filePath: "src/routes/products.tsx",
				hasInput: true,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/products",
			},
			{
				authenticateMode: false,
				cache: {},
				exportName: "route",
				filePath: "src/routes/about.tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/about",
			},
		]
		const result = generateRouteRegistry(defs, "src/_gen")
		expect(result).toContain("routeSearchParams:")
		expect(result).toContain(
			'"/products": InferSearchParams<typeof import("../routes/products")["route"]>',
		)
		expect(result).not.toContain('"/about": InferSearchParams')
	})

	it("omits routeSearchParams when no routes have input", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: {},
				exportName: "route",
				filePath: "src/routes/about.tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/about",
			},
		]
		const result = generateRouteRegistry(defs, "src/_gen")
		expect(result).not.toContain("routeSearchParams")
	})

	it("excludes response routes from routeSearchParams", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: {},
				exportName: "route",
				filePath: "src/routes/api.tsx",
				hasInput: true,
				responseRoute: true,
				type: "page",
				virtualPath: "_root_/api",
			},
		]
		const result = generateRouteRegistry(defs, "src/_gen")
		expect(result).not.toContain("routeSearchParams")
	})

	it("emits routeParams for pages with hasInput", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: {},
				exportName: "route",
				filePath: "src/routes/validated/[id].tsx",
				hasInput: true,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/validated/[id]",
			},
			{
				authenticateMode: false,
				cache: {},
				exportName: "route",
				filePath: "src/routes/about.tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/about",
			},
		]
		const result = generateRouteRegistry(defs, "src/_gen")
		expect(result).toContain("routeParams:")
		expect(result).toContain(
			'"/validated/[id]": InferParams<typeof import("../routes/validated/[id]")["route"]>',
		)
		expect(result).not.toContain('"/about": InferParams')
	})

	it("omits routeParams when no routes have input", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: {},
				exportName: "route",
				filePath: "src/routes/about.tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/about",
			},
		]
		const result = generateRouteRegistry(defs, "src/_gen")
		expect(result).not.toContain("routeParams")
	})

	it("excludes response routes from routeParams", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: {},
				exportName: "route",
				filePath: "src/routes/api.tsx",
				hasInput: true,
				responseRoute: true,
				type: "page",
				virtualPath: "_root_/api",
			},
		]
		const result = generateRouteRegistry(defs, "src/_gen")
		expect(result).not.toContain("routeParams")
	})
})

/* ── computeParentLayouts ──────────────────────────────────── */

describe("computeParentLayouts", () => {
	const layoutPaths = ["_root_", "_root_/(blog)", "_root_/(dashboard)"]

	it("root layout → empty", () => {
		expect(computeParentLayouts("_root_", layoutPaths)).toEqual([])
	})

	it("page under root → root only", () => {
		expect(computeParentLayouts("_root_/about", layoutPaths)).toEqual(["_root_"])
	})

	it("page under nested layout → root + layout sorted by depth", () => {
		expect(computeParentLayouts("_root_/(blog)/blog/[slug]", layoutPaths)).toEqual([
			"_root_",
			"_root_/(blog)",
		])
	})

	it("layout → parent layouts excluding self", () => {
		expect(computeParentLayouts("_root_/(blog)", layoutPaths)).toEqual(["_root_"])
	})

	it("unrelated layout group excluded", () => {
		const parents = computeParentLayouts("_root_/(blog)/blog/", layoutPaths)
		expect(parents).toEqual(["_root_", "_root_/(blog)"])
		expect(parents).not.toContain("_root_/(dashboard)")
	})

	it("deeply nested → full chain", () => {
		const deep = ["_root_", "_root_/(a)", "_root_/(a)/(b)"]
		expect(computeParentLayouts("_root_/(a)/(b)/page", deep)).toEqual([
			"_root_",
			"_root_/(a)",
			"_root_/(a)/(b)",
		])
	})
})

/* ── extractInterceptFromChain ─────────────────────────────────────── */

describe("extractInterceptFromChain", () => {
	it("extracts from and render", () => {
		const c = extractInterceptFromChain(`.intercept({ from: ["/products"], render: "modal" })`)
		expect(c).toEqual({ from: ["/products"], render: "modal" })
	})

	it("multiple from paths", () => {
		const c = extractInterceptFromChain(
			`.intercept({ from: ["/products", "/search"], render: "panel" })`,
		)
		expect(c).toEqual({ from: ["/products", "/search"], render: "panel" })
	})

	it("no .intercept() → undefined", () => {
		const c = extractInterceptFromChain(".cache({ client: { staleTime: 5000 } })")
		expect(c).toBeUndefined()
	})

	it("single-quoted strings", () => {
		const c = extractInterceptFromChain(`.intercept({ from: ['/items'], render: 'drawer' })`)
		expect(c).toEqual({ from: ["/items"], render: "drawer" })
	})

	it("missing render → undefined", () => {
		const c = extractInterceptFromChain(`.intercept({ from: ["/products"] })`)
		expect(c).toBeUndefined()
	})

	it("missing from → undefined", () => {
		const c = extractInterceptFromChain(`.intercept({ render: "modal" })`)
		expect(c).toBeUndefined()
	})

	it("intercept in route definition with other chain methods", () => {
		const chain = `.intercept({ from: ["/products"], render: "modal" }).cache({ client: { staleTime: 5000 } }).loader(async () => ({}))`
		const c = extractInterceptFromChain(chain)
		expect(c).toEqual({ from: ["/products"], render: "modal" })
	})
})

/* ── extractRouteDefinitions — intercept ─────────────────────────── */

describe("extractRouteDefinitions — intercept", () => {
	it("extracts intercept from page definition", () => {
		const src = `export const route = createPage("_root_/products/[id]").intercept({ from: ["/products"], render: "modal" }).render(() => null)`
		const defs = extractRouteDefinitions(src, "routes/products/[id].ts")
		expect(defs[0]?.intercept).toEqual({ from: ["/products"], render: "modal" })
	})

	it("no intercept when not present", () => {
		const src = `export const route = createPage("_root_/about").render(() => null)`
		const defs = extractRouteDefinitions(src, "routes/about.ts")
		expect(defs[0]?.intercept).toBeUndefined()
	})
})

/* ── formatRouteMeta — intercept in generated output ─────────────── */

describe("generateRoutesFile — intercept in meta", () => {
	let tmpDir: string

	beforeEach(() => {
		tmpDir = join(tmpdir(), `flare-gen-intercept-${Date.now()}`)
		mkdirSync(tmpDir, { recursive: true })
	})

	afterEach(() => {
		rmSync(tmpDir, { force: true, recursive: true })
	})

	it("includes intercept in route meta", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: {},
				exportName: "route",
				filePath: "src/routes/products/[id].tsx",
				hasInput: false,
				intercept: { from: ["/products"], render: "modal" },
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/products/[id]",
			},
		]
		const output = generateRoutesFile(defs, "src/_gen")
		expect(output).toContain('intercept: { from: ["/products"], render: "modal" }')
	})

	it("omits intercept when not present", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: {},
				exportName: "route",
				filePath: "src/routes/about.tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/about",
			},
		]
		const output = generateRoutesFile(defs, "src/_gen")
		expect(output).not.toContain("intercept")
	})
})

/* ── formatRouteMeta — ssg/isr in generated output ────────────── */

describe("generateRoutesFile — static meta in route", () => {
	it("emits static: { mode: 'static' } for ssg: true", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: { ssg: true },
				exportName: "page",
				filePath: "src/routes/about.tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/about",
			},
		]
		const output = generateRoutesFile(defs, "src/_gen")
		expect(output).toContain('static: { mode: "static" }')
	})

	it("emits mode: 'isr' with revalidate for ISR routes", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: { isr: true, isrRevalidate: 300 },
				exportName: "page",
				filePath: "src/routes/pricing.tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/pricing",
			},
		]
		const output = generateRoutesFile(defs, "src/_gen")
		expect(output).toContain('mode: "isr"')
		expect(output).toContain("revalidate: 300")
	})

	it("emits defer for ISR-dynamic routes", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: {
					isr: "dynamic",
					isrDefer: "stream",
					isrRevalidate: 60,
				},
				exportName: "page",
				filePath: "src/routes/products/[id].tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/products/[id]",
			},
		]
		const output = generateRoutesFile(defs, "src/_gen")
		expect(output).toContain('mode: "isr"')
		expect(output).toContain('defer: "stream"')
		expect(output).toContain("revalidate: 60")
	})

	it("emits dynamicParams: false for isrDynamicParams: false", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: { isr: "dynamic", isrDynamicParams: false, isrRevalidate: 120 },
				exportName: "page",
				filePath: "src/routes/posts/[slug].tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/posts/[slug]",
			},
		]
		const output = generateRoutesFile(defs, "src/_gen")
		expect(output).toContain("dynamicParams: false")
	})

	it("emits static: { mode: 'isr' } without revalidate for isr: true (on-demand)", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: { isr: true },
				exportName: "page",
				filePath: "src/routes/dashboard.tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/dashboard",
			},
		]
		const output = generateRoutesFile(defs, "src/_gen")
		expect(output).toContain('static: { mode: "isr" }')
		expect(output).not.toContain("revalidate")
	})

	it("emits static: { mode: 'static', defer: ... } for ssg with defer", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: { ssg: true, ssgDefer: "stream" },
				exportName: "page",
				filePath: "src/routes/about.tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/about",
			},
		]
		const output = generateRoutesFile(defs, "src/_gen")
		expect(output).toContain('static: { mode: "static", defer: "stream" }')
	})

	it("omits static when no static config", () => {
		const defs: RouteDefinition[] = [
			{
				authenticateMode: false,
				cache: {},
				exportName: "page",
				filePath: "src/routes/about.tsx",
				hasInput: false,
				responseRoute: false,
				type: "page",
				virtualPath: "_root_/about",
			},
		]
		const output = generateRoutesFile(defs, "src/_gen")
		expect(output).not.toContain("static:")
	})
})
