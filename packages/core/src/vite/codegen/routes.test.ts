import { parseSync } from "oxc-parser"
import { expect, it } from "vitest"
import { defineLayouts, defineRouteTree, generateRoutes } from "./routes.ts"

const rootLayout = "_root_/root.root-layout.tsx"

// Every file of a case shares this source. Its id is a name the scan does not resolve, so no case checks it.
const routeSource = `export const route = createPage(ID);\n`

function read(): string {
	return routeSource
}

function routesOf(files: readonly string[]) {
	return generateRoutes([...files, rootLayout], read)
}

it("define helpers", () => {
	expect(defineRouteTree(["_root_"])).toEqual(["_root_"])
	expect(defineLayouts(["root"])).toEqual(["root"])
})

it("one route", () => {
	const source = routesOf(["_root_/home.page.tsx"]).source
	expect(source).not.toContain("import { route")
	expect(source).toContain(
		'export const routeTree = [{ id: "_root_/", path: "/", module: () => import("../routes/_root_/home.page.tsx") }];',
	)
	expect(source).toContain(
		'export const layouts = { "_root_": () => import("../routes/_root_/root.root-layout.tsx") };',
	)
	expect(source).toContain(
		'export const chunks = { "_root_/": "/src/routes/_root_/home.page.tsx", "_root_": "/src/routes/_root_/root.root-layout.tsx" };',
	)
	const moved = generateRoutes(["_root_/home.page.tsx", rootLayout], read, { routesDir: "app/routes" }).source
	expect(moved).toContain('"_root_/": "/app/routes/_root_/home.page.tsx"')
	// The file is src/_gen/routes.gen.ts, so each import is relative from there, as types.gen.d.ts's are.
	expect(moved).toContain('import("../../app/routes/_root_/home.page.tsx")')
})

it("filename", () => {
	const generated = routesOf(["_root_/home.page.tsx"])
	expect(generated.routes[0]?.id).toBe("_root_/")
	expect(generated.routes[0]?.path).toBe("/")
	expect(generated.routes[0]?.urls).toEqual(["/"])
	expect(generated.layouts[0]?.id).toBe("_root_")
	const locale = generateRoutes(["[locale]/_root_/home.page.tsx", "[locale]/_root_/root.root-layout.tsx"], read)
	expect(locale.routes[0]?.id).toBe("[locale]/_root_/")
	expect(locale.routes[0]?.urls).toEqual(["/[locale]"])
	expect(routesOf(["_admin_/home.page.tsx", "_admin_/admin.root-layout.tsx"]).routes[0]?.id).toBe("_admin_/")
	expect(routesOf(["_root_/about/about.page.tsx"]).routes[0]?.id).toBe("_root_/about")
})

it("layout beside page", () => {
	expect(() => routesOf(["_root_/blog/blog.layout.tsx", "_root_/blog/blog.page.tsx"])).toThrow(
		"layout beside page: _root_/blog/blog.layout.tsx, _root_/blog/blog.page.tsx",
	)
	expect(() => routesOf(["_root_/docs/docs.layout.tsx", "_root_/docs/docs.segment.ts"])).toThrow(
		"layout beside page: _root_/docs/docs.layout.tsx, _root_/docs/docs.segment.ts",
	)
	expect(() => routesOf(["_root_/(blog)/(blog).layout.tsx", "_root_/(blog)/post/post.page.tsx"])).not.toThrow()
})

it("about", () => {
	const route = routesOf(["_root_/about/about.page.tsx"]).routes[0]
	expect(route?.id).toBe("_root_/about")
	expect(route?.urls).toEqual(["/about"])
})

it("group", () => {
	const generated = routesOf(["_root_/(blog)/(blog).layout.tsx", "_root_/(blog)/post/post.page.tsx"])
	expect(generated.routes[0]?.urls).toEqual(["/post"])
	expect(generated.layouts[0]?.id).toBe("_root_/(blog)")
})

it("param", () => {
	const route = routesOf(["_root_/users/[id]/[id].page.tsx"]).routes[0]
	expect(route?.urls).toEqual(["/users/[id]"])
	expect(route?.params).toEqual({ id: "string" })
})

it("catch-all", () => {
	const route = routesOf(["_root_/files/[...path]/[...path].page.tsx"]).routes[0]
	expect(route?.urls).toEqual(["/files/[...path]"])
	expect(route?.params).toEqual({ path: "string[]" })
})

it("optional", () => {
	const route = routesOf(["_root_/optional-locale/[[locale]]/[[locale]].page.tsx"]).routes[0]
	expect(route?.urls).toEqual(["/optional-locale", "/optional-locale/<tag>"])
	expect(route?.params).toEqual({ locale: "string | undefined" })
})

it("optional catch-all", () => {
	const route = routesOf(["_root_/[[...rest]]/[[...rest]].page.tsx"]).routes[0]
	expect(route?.urls).toContain("/")
	expect(route?.params).toEqual({ rest: "string[] | undefined" })
})

it("admin root", () => {
	const route = routesOf(["_admin_/dashboard/dashboard.page.tsx", "_admin_/admin.root-layout.tsx"]).routes[0]
	expect(route?.urls).toEqual(["/dashboard"])
})

it("locale root", () => {
	const route = routesOf(["[locale]/_root_/about/about.page.tsx", "[locale]/_root_/locale.root-layout.tsx"]).routes[0]
	expect(route?.urls).toEqual(["/[locale]/about"])
})

it("literal brackets", () => {
	const route = routesOf(["_root_/[_]id]/home.page.tsx"]).routes[0]
	expect(route?.urls).toEqual(["/[id]"])
})

// A folder that starts with `_` and does not end with `_` holds no routes, its page and layout files included.
it("ignored", () => {
	expect(generateRoutes(["_parts/widget.tsx"], read).routes).toEqual([])
	const hidden = ["_root_/_parts/card.page.tsx", "_root_/_parts/x/x.layout.tsx", "_root_/_parts/x/y/y.page.tsx"]
	// A file with no route suffix is not a route wherever it sits.
	const generated = routesOf(["_root_/home.page.tsx", "_root_/format.ts", ...hidden])
	expect(generated.routes.map((route) => route.id)).toEqual(["_root_/"])
	expect(generated.layouts.map((layout) => layout.id)).toEqual(["_root_"])
	expect(generated.source).not.toContain("_parts")
})

// The string in a route file's builder call is the file's id, or codegen fails naming the file (dx/routes.md).
it("id mismatch", () => {
	const sources: Record<string, string> = {
		"_root_/root.root-layout.tsx": `export const route = createRootLayout("_root_");\n`,
		"_root_/about/about.page.tsx": `export const route = createPage("_root_/abut");\n`,
	}
	const files = Object.keys(sources)
	const generate = () => generateRoutes(files, (file) => sources[file] ?? "")
	expect(generate).toThrow('_root_/about/about.page.tsx: the id string "_root_/abut" is not "_root_/about"')
	sources["_root_/about/about.page.tsx"] = `export const route = createPage("_root_/about");\n`
	sources["_root_/root.root-layout.tsx"] = `export const route = createRootLayout("_admin_");\n`
	expect(generate).toThrow('_root_/root.root-layout.tsx: the id string "_admin_" is not "_root_"')
	sources["_root_/root.root-layout.tsx"] = `export const route = createRootLayout("_root_");\n`
	expect(generate().routes).toHaveLength(1)
})

it("repeated param", () => {
	expect(() => routesOf(["_root_/[id]/posts/[id]/post.page.tsx"])).toThrow("post.page.tsx")
	const distinct = routesOf(["_root_/[id]/[slug]/post.page.tsx"]).routes[0]
	expect(distinct?.params).toEqual({ id: "string", slug: "string" })
})

it("two params", () => {
	const same = ["_root_/[id]/a.page.tsx", "_root_/[slug]/b.page.tsx"]
	expect(() => routesOf(same)).toThrow("[id]/a.page.tsx")
	expect(() => routesOf(same)).toThrow("[slug]/b.page.tsx")
	const each = ["_root_/[id]/a.page.tsx", "_root_/[[locale]]/b.page.tsx", "_root_/[...path]/c.page.tsx"]
	expect(routesOf(each).routes).toHaveLength(3)
	const catchAlls = ["_root_/[id]/a.page.tsx", "_root_/[...path]/c.page.tsx", "_root_/[[...rest]]/d.page.tsx"]
	expect(routesOf(catchAlls).routes).toHaveLength(3)
	const otherParent = ["_root_/users/[id]/a.page.tsx", "_root_/posts/[slug]/b.page.tsx"]
	expect(routesOf(otherParent).routes).toHaveLength(2)
	// Two pages under one param folder share that folder: it is one param, not two.
	const nested = ["_root_/post/[slug]/a.page.tsx", "_root_/post/[slug]/comments/b.page.tsx"]
	expect(routesOf(nested).routes).toHaveLength(2)
})

it("index folder", () => {
	const route = routesOf(["_root_/index/home.page.tsx"]).routes[0]
	expect(route?.id).toBe("_root_/index")
	expect(route?.urls).toEqual(["/index"])
})

it("no root", () => {
	const pages = ["_root_/home.page.tsx", "_root_/about/about.page.tsx"]
	expect(() => generateRoutes(pages, read)).toThrow("home.page.tsx")
	expect(() => generateRoutes(pages, read)).toThrow("about/about.page.tsx")
	expect(routesOf(pages).routes).toHaveLength(2)
})

// Each page needs its own root's layout, the id up to its first root folder: a `_root_` root layout does not serve an
// `_admin_` page, which would render with no document. Two layout files with one id, which the router's layout record
// keeps one of, fail too. Both name the files (plan 21 13.3, BUGS.md 206).
it("own root", () => {
	expect(() => routesOf(["_admin_/dashboard/dashboard.page.tsx"])).toThrow(
		"no root layout for _admin_: _admin_/dashboard/dashboard.page.tsx",
	)
	expect(() => routesOf(["[locale]/_root_/about/about.page.tsx"])).toThrow(
		"no root layout for [locale]/_root_: [locale]/_root_/about/about.page.tsx",
	)
	expect(() => routesOf(["about/about.page.tsx"])).toThrow("no root layout for about/about.page.tsx")
	expect(() => routesOf(["_root_/(blog)/a.layout.tsx", "_root_/(blog)/b.layout.tsx"])).toThrow(
		"two layouts for _root_/(blog): _root_/(blog)/a.layout.tsx, _root_/(blog)/b.layout.tsx",
	)
	expect(() => routesOf(["_root_/main.layout.tsx"])).toThrow(
		"two layouts for _root_: _root_/main.layout.tsx, _root_/root.root-layout.tsx",
	)
})

it("duplicate url", () => {
	const files = [
		"_root_/dashboard/dashboard.page.tsx",
		"_admin_/dashboard/dashboard.page.tsx",
		"_admin_/admin.root-layout.tsx",
	]
	expect(() => routesOf(files)).toThrow(/_root_\/dashboard\/dashboard\.page\.tsx/)
	expect(() => routesOf(files)).toThrow(/_admin_\/dashboard\/dashboard\.page\.tsx/)
})

it("shadow", () => {
	const files = ["_root_/files/readme/readme.page.tsx", "_root_/files/[...path]/[...path].page.tsx"]
	expect(() => routesOf(files)).toThrow(/readme\.page\.tsx/)
	expect(() => routesOf(files)).toThrow(/\[\.\.\.path\]\.page\.tsx/)
})

it("two pages", () => {
	const files = ["_root_/home.page.tsx", "_root_/index.page.tsx"]
	expect(() => routesOf(files)).toThrow(/home\.page\.tsx/)
	expect(() => routesOf(files)).toThrow(/index\.page\.tsx/)
})

it("missing route export", () => {
	const sources: Record<string, string> = {
		"_root_/root.root-layout.tsx": `export const route = createRootLayout("_root_");\n`,
		"_root_/home.page.tsx": `export default createPage("_root_/");\n`,
		"_root_/about/about.page.tsx": `const route = createPage("_root_/about");\nexport { route };\n`,
	}
	const files = Object.keys(sources)
	expect(() => generateRoutes(files, (file) => sources[file])).toThrow("_root_/home.page.tsx")
	sources["_root_/home.page.tsx"] = `export const route = createPage("_root_/");\n`
	expect(generateRoutes(files, (file) => sources[file]).routes).toHaveLength(2)
	sources["_root_/root.root-layout.tsx"] = `export const page = createRootLayout("_root_");\n`
	expect(() => generateRoutes(files, (file) => sources[file])).toThrow("_root_/root.root-layout.tsx")
})

it("response flag", () => {
	const sources: Record<string, string> = {
		"_root_/api/api.page.tsx": 'export const route = createPage("_root_/api").response(() => new Response("ok"));\n',
	}
	const generated = generateRoutes(
		["_root_/api/api.page.tsx", "_root_/home.page.tsx", rootLayout],
		(file) => sources[file] ?? routeSource,
	)
	expect(generated.source).toContain('{ id: "_root_/api", path: "/api", response: true, module: () =>')
	expect(generated.source).toContain('{ id: "_root_/", path: "/", module: () =>')
	expect(generated.routes.map((route) => route.response)).toEqual([true, false])
})

// A `.response()` page's literal methods ride on its node, so routing refuses a method it does not answer before the
// module loads (plan 21 13.5, BUGS.md 208).
it("response methods", () => {
	const api = 'export const route = createPage("_root_/api").response(h, { methods: ["POST"] });\n'
	const generated = generateRoutes(["_root_/api/api.page.tsx", rootLayout], (file) =>
		file.includes("api") ? api : routeSource,
	)
	expect(generated.source).toContain(
		'{ id: "_root_/api", path: "/api", response: true, methods: ["POST"], module: () =>',
	)
})

// The route record carries the literal `cache.client` fields and the intercept, which Link and navigation read before
// the route's code loads (B89).
it("client literals", () => {
	const page = `export const route = createPage("_root_/")
	.cache({ client: { prefetch: { data: "hover", modules: "viewport" }, staleTime: "30s", gcTime: "5m", prefetchStaleTime: "10s", prefetchGcTime: "1m", cacheDeferred: true } })
	.intercept({ from: ["_root_/list"], render: "modal" })
	.render(() => "x");
`
	const off = 'export const route = createPage("_root_/off").cache({ client: false }).render(() => "x");\n'
	const sources: Record<string, string> = { "_root_/home.page.tsx": page, "_root_/off/off.page.tsx": off }
	const generated = generateRoutes(
		["_root_/home.page.tsx", "_root_/off/off.page.tsx", rootLayout],
		(file) => sources[file] ?? routeSource,
	).source
	expect(generated).toContain(
		'{ id: "_root_/", path: "/", client: {"prefetch":{"data":"hover","modules":"viewport"},"staleTime":"30s","gcTime":"5m","prefetchStaleTime":"10s","prefetchGcTime":"1m","cacheDeferred":true}, intercept: {"from":["_root_/list"],"render":"modal"}, module: () =>',
	)
	expect(generated).toContain('{ id: "_root_/off", path: "/off", client: false, module: () =>')
})

// Auth and the server cache modes stay off the record. A non-literal client field is left out and is not an error.
it("no auth copy", () => {
	const page = `const ttl = "30s";
export const route = createPage("_root_/")
	.authenticate(() => null)
	.cache({ ssg: true, client: { staleTime: ttl, gcTime: "5m", prefetch: { data: mode }, prefetchStaleTime: { ...base }, prefetchGcTime: { [key]: "1m" } } })
	.render(() => "x");
`
	const generated = generateRoutes(["_root_/home.page.tsx", rootLayout], (file) =>
		file === rootLayout ? routeSource : page,
	).source
	expect(generated).toContain('{ id: "_root_/", path: "/", client: {"gcTime":"5m"}, module: () =>')
	expect(generated).not.toMatch(/auth|ssg|staleTime|prefetch/)
	const none =
		'export const route = createPage("_root_/").cache({ client: { staleTime: ttl } }).cache(config).render(() => "x");\n'
	const bare = generateRoutes(["_root_/home.page.tsx", rootLayout], (file) =>
		file === rootLayout ? routeSource : none,
	)
	expect(bare.source).toContain('{ id: "_root_/", path: "/", module: () =>')
})

// A path segment joins the chain of the pages under it, as a layout does (B17, B21; BUGS.md B22).
it("segment emitted", () => {
	const generated = routesOf(["_root_/docs/docs.segment.ts", "_root_/docs/[slug]/slug.page.tsx"])
	expect(generated.layouts.map((layout) => layout.id)).toContain("_root_/docs")
	expect(generated.source).toContain('"_root_/docs": () => import("../routes/_root_/docs/docs.segment.ts")')
	expect(generated.source).toContain('"_root_/docs": "/src/routes/_root_/docs/docs.segment.ts"')
})

// A route folder named with a newline, U+2028, or U+2029 still generates code that parses, each name written as an
// escaped string literal, never raw (plan 21 16.6, BUGS.md 165). A param name is an identifier already.
it("hostile names", () => {
	const names = ["a\nb", "c\u2028d", "e\u2029f"]
	const { source } = routesOf(names.map((name, index) => `_root_/${name}/p${index}.page.tsx`))
	expect(parseSync("routes.gen.ts", source).errors).toEqual([])
	for (const raw of ['\n"', "\u2028", "\u2029"]) expect([raw, source.includes(raw)]).toEqual([raw, false])
	expect(source).toContain(String.raw`"_root_/a\nb"`)
	expect(source).toContain(String.raw`"_root_/c\u2028d"`)
})
