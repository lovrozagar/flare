import { parseSync } from "oxc-parser"
import { expect, it } from "vitest"
import { chunkReferences, defineLayouts, defineRouteTree, generateRoutes } from "./routes.ts"

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
	// The file is src/_gen/routes.gen.ts, so each import is relative from there, as types.gen.ts's are.
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
	// Under one parent, two names for one param folder clash even where the URLs differ after it (a same URL is a
	// duplicate, `same url`).
	const same = ["_root_/[id]/a/a.page.tsx", "_root_/[slug]/b/b.page.tsx"]
	expect(() => routesOf(same)).toThrow("two params: _root_/[id]/a/a.page.tsx, _root_/[slug]/b/b.page.tsx")
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

// Two pages the matcher cannot tell apart are one URL, and fail the build naming both: static folders that differ only
// in case (the router matches case-insensitively by default), and params of one kind under one URL parent, whatever
// their names or the group or root between them. A literal-bracket folder is static text, not its param (BUGS.md 406).
it("same url", () => {
	const clashes = [
		["_root_/About/a.page.tsx", "_root_/about/b.page.tsx"],
		["_root_/users/[id]/a.page.tsx", "_root_/(g)/users/[slug]/b.page.tsx"],
		["_root_/(a)/[id]/a.page.tsx", "_root_/(b)/[slug]/b.page.tsx"],
		["_root_/[id]/a.page.tsx", "_admin_/[key]/b.page.tsx", "_admin_/admin.root-layout.tsx"],
		["_root_/docs/[...p]/a.page.tsx", "_root_/(g)/docs/[...rest]/b.page.tsx"],
	]
	for (const [first, second, ...rest] of clashes) {
		expect(() => routesOf([first ?? "", second ?? "", ...rest])).toThrow(`duplicate url: ${first}, ${second}`)
	}
	const apart = [
		["_root_/[_]id]/a.page.tsx", "_root_/[id]/b.page.tsx"],
		["_root_/[_]...p]/a.page.tsx", "_root_/(g)/[...p]/b.page.tsx"],
	]
	for (const routeFiles of apart) expect(routesOf(routeFiles).routes).toHaveLength(2)
})

// A catch-all beside a static page builds: the router ranks the static page first, so it hides nothing. The home page
// beside a root catch-all, a group between them, and an optional catch-all build too (BUGS.md 418).
it("static beside catch-all", () => {
	const pairs = [
		["_root_/docs/readme/readme.page.tsx", "_root_/docs/[...path]/docs.page.tsx"],
		["_root_/home.page.tsx", "_root_/[...path]/nf.page.tsx"],
		["_root_/guide/(g)/intro/intro.page.tsx", "_root_/guide/[...path]/guide.page.tsx"],
		["_root_/ref/api/api.page.tsx", "_root_/ref/[[...path]]/ref.page.tsx"],
	]
	for (const pair of pairs) expect(routesOf(pair).routes).toHaveLength(2)
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
	const list = 'export const route = createPage("_root_/list").render(() => "x");\n'
	const sources: Record<string, string> = {
		"_root_/home.page.tsx": page,
		"_root_/off/off.page.tsx": off,
		"_root_/list/list.page.tsx": list,
	}
	const files = ["_root_/home.page.tsx", "_root_/off/off.page.tsx", "_root_/list/list.page.tsx", rootLayout]
	const generated = generateRoutes(files, (file) => sources[file] ?? routeSource).source
	expect(generated).toContain(
		'{ id: "_root_/", path: "/", client: {"prefetch":{"data":"hover","modules":"viewport"},"staleTime":"30s","gcTime":"5m","prefetchStaleTime":"10s","prefetchGcTime":"1m","cacheDeferred":true}, intercept: {"from":["_root_/list"],"render":"modal"}, module: () =>',
	)
	expect(generated).toContain('{ id: "_root_/off", path: "/off", client: false, module: () =>')
})

// An intercept's `from` names pages: an id no page has, a URL path among them, fails codegen, naming the file and the
// id (BUGS.md 401).
it("intercept ids", () => {
	for (const id of ["/photos", "_root_/no-such-route", "_root_"]) {
		const page = `export const route = createPage("_root_/").intercept({ from: [${JSON.stringify(id)}], render: "modal" }).render(() => "x");\n`
		const generate = () =>
			generateRoutes(["_root_/home.page.tsx", rootLayout], (file) => (file === rootLayout ? routeSource : page))
		expect(generate).toThrow(`_root_/home.page.tsx: intercept from: no route has id ${JSON.stringify(id)}`)
	}
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

// A route folder named with a tab, a quote, or `</` still generates code that parses, each name written as an escaped
// string literal, never raw (plan 21 16.6, BUGS.md 165). A param name is an identifier already.
it("hostile names", () => {
	const names = ["a\tb", 'c"d', "e</f"]
	const { source } = routesOf(names.map((name, index) => `_root_/${name}/p${index}.page.tsx`))
	expect(parseSync("routes.gen.ts", source).errors).toEqual([])
	for (const raw of ['"_root_/a\tb"', '"_root_/c"d"', "_root_/e</f"])
		expect([raw, source.includes(raw)]).toEqual([raw, false])
	expect(source).toContain(String.raw`"_root_/a\tb"`)
	expect(source).toContain(String.raw`"_root_/c\"d"`)
	expect(source).toContain(String.raw`"_root_/e<\/f"`)
})

// A line break in any name under src/routes, a folder's or a file's, is refused, the path shown escaped: the bundler
// writes each module's path into a `//#region` line comment, where the break would end the comment and turn the rest of
// the path into code (BUGS.md 425).
it("line terminators", () => {
	for (const [raw, shown] of [
		["\n", "\\n"],
		["\r", "\\r"],
		["\u2028", "\\u2028"],
		["\u2029", "\\u2029"],
	]) {
		const reason =
			"a path under src/routes cannot hold a line break: the bundler writes module paths into line comments"
		expect(() => routesOf([`_root_/x${raw}y/p.page.tsx`])).toThrow(`_root_/x${shown}y/p.page.tsx: ${reason}`)
		expect(() => routesOf([`_root_/_parts/a${raw}b.tsx`])).toThrow(`_root_/_parts/a${shown}b.tsx: ${reason}`)
	}
})

// A `crossOrigin` route whose chain authenticates or authorizes, in the page file or a layout above it, fails the build,
// naming the page: a forged cross-site post would act as the visitor (B44, BUGS.md 273).
it("cross origin chain", () => {
	const page = `export const route = createPage("_root_/(g)/hook").response(h, { methods: ["POST"], crossOrigin: true });\n`
	const sources: Record<string, string> = {
		"_root_/root.root-layout.tsx": `export const route = createRootLayout("_root_");\n`,
		"_root_/(g)/(g).layout.tsx": `export const route = createLayout("_root_/(g)").authorize(check);\n`,
		"_root_/(g)/hook/hook.page.tsx": page,
	}
	const generate = () => generateRoutes(Object.keys(sources), (file) => sources[file] ?? "")
	expect(generate).toThrow("_root_/(g)/hook/hook.page.tsx: .response() crossOrigin: true needs")
	sources["_root_/(g)/(g).layout.tsx"] = `export const route = createLayout("_root_/(g)");\n`
	expect(generate().routes.map((route) => route.id)).toEqual(["_root_/(g)/hook"])
	sources["_root_/(g)/hook/hook.page.tsx"] = page.replace(".response(", ".authenticate().response(")
	expect(generate).toThrow("_root_/(g)/hook/hook.page.tsx: .response() crossOrigin: true needs")
})

// The built chunks map emits each route module by its real path, a hostile folder name included: the generated
// source escapes a tab, a quote, and `</`, and the build reads each path back as the file it names (BUGS.md 422).
it("chunk paths", () => {
	const names = ["x\ty", 'say "hi"', "a</b"]
	const files = names.map((name) => `_root_/${name}/p.page.tsx`)
	const source = generateRoutes([...files, rootLayout], read).source
	const emitted: string[] = []
	chunkReferences(source, (path) => {
		emitted.push(path)
		return String(emitted.length)
	})
	for (const name of names) expect(emitted).toContain(`/src/routes/_root_/${name}/p.page.tsx`)
})
