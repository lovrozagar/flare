import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createServer as createViteServer, isRunnableDevEnvironment } from "vite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { flare } from "../../src/vite/plugin/flare.ts"
import { builtServer, failedBuild, fixtureApps, page, rootLayout, viteBuild, type Server } from "./vite-app.ts"

// dx/routes.md through real apps (B96): each fixture is an app of route files under src/routes, built by `vite build`
// from a config file with flare(), as the CLI runs it, and answered by the built server's `fetch`. A build error is
// that build's failure. The lazy route wait runs in `vite dev`'s SSR runner, where it applies.

const apps = fixtureApps()

afterAll(() => apps.removeAll())

function layout(id: string): string {
	return `import { createLayout } from "@lovrozagar/flare";\nexport const route = createLayout(${JSON.stringify(id)}).render((props) => <section id="layout">{props.children}</section>);\n`
}

// An app of the shell plus route files, keyed by their path under src/routes.
function project(routes: Record<string, string>): string {
	return apps.make(Object.fromEntries(Object.entries(routes).map(([path, source]) => [`src/routes/${path}`, source])))
}

// The built app's server, or the build's output as the failure.
function served(routes: Record<string, string>): Promise<Server> {
	return builtServer(project(routes))
}

type Answer = { status: number; root: string | undefined; layout: boolean; page: string | undefined }

// What a GET of the path answers: the status, the document's root, whether the group's layout wraps the page, and the
// page's text.
async function get(server: Server, path: string): Promise<Answer> {
	const response = await server.fetch(new Request(`http://localhost${path}`))
	const html = await response.text()
	const text = /<p [^>]*id="page">(.*?)<\/p>/s.exec(html)?.[1]
	return {
		status: response.status,
		root: /<body [^>]*data-root="([^"]*)"/.exec(html)?.[1],
		layout: /<section [^>]*id="layout">/.test(html),
		page: text?.replace(/<!--.*?-->/g, "").replaceAll("&quot;", '"'),
	}
}

// The table's files, but `files/[[...rest]]`, which cannot share `files` with `[...path]` (`two params`).
const TABLE: Record<string, string> = {
	"_root_/root.root-layout.tsx": rootLayout("_root_"),
	"_root_/home.page.tsx": page("_root_/"),
	"_root_/about/about.page.tsx": page("_root_/about"),
	"_root_/(blog)/blog.layout.tsx": layout("_root_/(blog)"),
	"_root_/(blog)/post/post.page.tsx": page("_root_/(blog)/post"),
	"_root_/users/[id]/user.page.tsx": page("_root_/users/[id]"),
	"_root_/files/[...path]/files.page.tsx": page("_root_/files/[...path]"),
	"_root_/optional-locale/[[locale]]/opt.page.tsx": page("_root_/optional-locale/[[locale]]"),
	"_admin_/root.root-layout.tsx": rootLayout("_admin_"),
	"_admin_/dashboard/dash.page.tsx": page("_admin_/dashboard"),
	"[locale]/_root_/root.root-layout.tsx": rootLayout("[locale]/_root_"),
	"[locale]/_root_/about/about.page.tsx": page("[locale]/_root_/about"),
	"_root_/[_]id]/page.page.tsx": page("_root_/[_]id]"),
	"_root_/users/me/me.page.tsx": page("_root_/users/me"),
	"_root_/rank/[[lang]]/lang.page.tsx": page("_root_/rank/[[lang]]"),
	"_root_/rank/[[lang]]/pricing/pricing.page.tsx": page("_root_/rank/[[lang]]/pricing"),
	"_root_/index/index.page.tsx": page("_root_/index"),
	'_root_/say "hi"/odd.page.tsx': page('_root_/say "hi"'),
	"_root_/search/search.page.tsx": [
		'import { createPage } from "@lovrozagar/flare";',
		'export const route = createPage("_root_/search")',
		"\t.loader((ctx) => ({ search: JSON.stringify(ctx.search), proto: Object.getPrototypeOf(ctx.search) === null }))",
		'\t.render((props) => <p id="page">{props.loaderData.search} {String(props.loaderData.proto)}</p>);',
		"",
	].join("\n"),
	// Not routes: a folder that starts with `_` and does not end with `_`, even a page file in it.
	"_root_/_parts/widget.tsx": "export const widget = 1;\n",
	"_root_/_parts/card.page.tsx": page("_root_/_parts"),
}

const REST: Record<string, string> = {
	"_root_/root.root-layout.tsx": rootLayout("_root_"),
	"_root_/files/[[...rest]]/files.page.tsx": page("_root_/files/[[...rest]]"),
}

let table: Server | undefined
let rest: Server | undefined

beforeAll(async () => {
	;[table, rest] = await Promise.all([served(TABLE), served(REST)])
})

function at(server: Server | undefined, path: string): Promise<Answer> {
	if (server === undefined) throw new Error("the app did not build")
	return get(server, path)
}

// The root layout is the document and has no URL of its own; its home page serves `/`.
it("root and home", async () => {
	expect(await at(table, "/")).toEqual({ status: 200, root: "_root_", layout: false, page: "_root_/ {}" })
	expect((await at(table, "/_root_")).status).toBe(404)
})

// The directory path is the id and the URL; the filename is not a segment.
it("about", async () => {
	expect(await at(table, "/about")).toEqual({ status: 200, root: "_root_", layout: false, page: "_root_/about {}" })
})

// A group adds no segment, and its layout wraps the pages under it.
it("group no segment", async () => {
	const post = await at(table, "/post")
	expect(post).toEqual({ status: 200, root: "_root_", layout: true, page: "_root_/(blog)/post {}" })
	expect((await at(table, "/(blog)/post")).status).toBe(404)
	expect((await at(table, "/blog")).status).toBe(404)
})

it("param", async () => {
	expect((await at(table, "/users/42")).page).toBe('_root_/users/[id] {"id":"42"}')
	expect((await at(table, "/users")).status).toBe(404)
})

// A catch-all takes the rest of the path, at least one segment.
it("catch-all", async () => {
	expect((await at(table, "/files/a/b")).page).toBe('_root_/files/[...path] {"path":["a","b"]}')
	expect((await at(table, "/files")).status).toBe(404)
})

it("optional", async () => {
	expect((await at(table, "/optional-locale")).page).toBe("_root_/optional-locale/[[locale]] {}")
	expect((await at(table, "/optional-locale/hr")).page).toBe('_root_/optional-locale/[[locale]] {"locale":"hr"}')
})

it("optional catch-all", async () => {
	expect((await at(rest, "/files")).page).toBe("_root_/files/[[...rest]] {}")
	expect((await at(rest, "/files/a/b")).page).toBe('_root_/files/[[...rest]] {"rest":["a","b"]}')
})

// The root marker leaves the URL: `_admin_/dashboard` is `/dashboard`, in the admin root's own document.
it("admin root", async () => {
	const dashboard = await at(table, "/dashboard")
	expect(dashboard).toEqual({ status: 200, root: "_admin_", layout: false, page: "_admin_/dashboard {}" })
	expect((await at(table, "/admin/dashboard")).status).toBe(404)
})

// A param before the root marker stays in the URL.
it("locale root", async () => {
	const about = await at(table, "/hr/about")
	const page = '[locale]/_root_/about {"locale":"hr"}'
	expect(about).toEqual({ status: 200, root: "[locale]/_root_", layout: false, page })
})

// `[_]id]` is the static segment `[id]`.
it("literal brackets", async () => {
	expect(await at(table, "/[id]")).toEqual({ status: 200, root: "_root_", layout: false, page: "_root_/[_]id] {}" })
	expect((await at(table, "/42")).status).toBe(404)
})

// `_parts` is not a route: no URL reaches its widget or its page file (BUGS.md 131).
it("ignored", async () => {
	expect((await at(table, "/_parts/widget")).status).toBe(404)
	expect((await at(table, "/_parts")).status).toBe(404)
})

// Each root layout is its own document.
it("more than one root", async () => {
	const roots = await Promise.all(["/", "/dashboard", "/hr/about"].map(async (path) => (await at(table, path)).root))
	expect(roots).toEqual(["_root_", "_admin_", "[locale]/_root_"])
})

// A param value stays percent-encoded and is not decoded, an invalid escape kept as written; a lowercase escape is
// 301 to its uppercase form, and a `%2F` inside a segment is 400 before any route matches (routes.md Brackets,
// canonical-redirect.test `hostile`).
it("percent params", async () => {
	const pages = []
	for (const path of ["/users/a%3Ab", "/users/%ZZ", "/users/a%25"]) pages.push((await at(table, path)).page)
	expect(pages).toEqual([
		'_root_/users/[id] {"id":"a%3Ab"}',
		'_root_/users/[id] {"id":"%ZZ"}',
		'_root_/users/[id] {"id":"a%25"}',
	])
	const lower = await table?.fetch(new Request("http://localhost/users/a%3ab"))
	expect([lower?.status, lower?.headers.get("location")]).toEqual([301, "/users/a%3Ab"])
	expect((await at(table, "/users/a%2fb")).status).toBe(400)
})

// Rank: a static segment before a param, and an optional param that matched nothing consumed nothing, so `/rank/pricing`
// is the pricing page, not the tag `pricing` (routes.md Brackets).
it("rank", async () => {
	const pages = []
	for (const path of ["/users/me", "/users/7", "/rank/pricing", "/rank/hr", "/rank/hr/pricing"])
		pages.push((await at(table, path)).page)
	expect(pages).toEqual([
		"_root_/users/me {}",
		'_root_/users/[id] {"id":"7"}',
		"_root_/rank/[[lang]]/pricing {}",
		'_root_/rank/[[lang]] {"lang":"hr"}',
		'_root_/rank/[[lang]]/pricing {"lang":"hr"}',
	])
})

// The search is a null-prototype record: prototype keys dropped, `""` kept, a repeated key a list in appearance order
// (routes.md Brackets).
it("search record", async () => {
	const answer = await at(table, "/search?b=2&a=1&a=3&__proto__=x&constructor=y&prototype=z&e=")
	expect(answer.page).toBe('{"b":"2","a":["1","3"],"e":""} true')
})

// A folder named `index` is not special, and a folder name with any character the file system allows but a line break
// is a route (routes.md Brackets, BUGS.md 165, 425).
it("index and hostile folders", async () => {
	expect((await at(table, "/index")).page).toBe("_root_/index {}")
	expect((await at(table, "/say%20%22hi%22")).page).toBe('_root_/say "hi" {}')
})

// A catch-all beside a static page: the static page wins and the catch-all takes every other path, the home page and a
// root catch-all, a group between them, or an optional catch-all alike (dx/routes.md, BUGS.md 418).
it("static beside catch-all", async () => {
	const server = await served({
		"_root_/root.root-layout.tsx": rootLayout("_root_"),
		"_root_/home.page.tsx": page("_root_/"),
		"_root_/[...path]/nf.page.tsx": page("_root_/[...path]"),
		"_root_/docs/readme/readme.page.tsx": page("_root_/docs/readme"),
		"_root_/docs/[...path]/docs.page.tsx": page("_root_/docs/[...path]"),
		"_root_/guide/(g)/intro/intro.page.tsx": page("_root_/guide/(g)/intro"),
		"_root_/guide/[...path]/guide.page.tsx": page("_root_/guide/[...path]"),
		"_root_/ref/api/api.page.tsx": page("_root_/ref/api"),
		"_root_/ref/[[...path]]/ref.page.tsx": page("_root_/ref/[[...path]]"),
	})
	const pages = []
	for (const path of [
		"/",
		"/x",
		"/docs/readme",
		"/docs/other",
		"/guide/intro",
		"/guide/x",
		"/ref/api",
		"/ref/x",
		"/ref",
	]) {
		const answer = await get(server, path)
		pages.push([path, answer.status, answer.page?.split(" ")[0]])
	}
	expect(pages).toEqual([
		["/", 200, "_root_/"],
		["/x", 200, "_root_/[...path]"],
		["/docs/readme", 200, "_root_/docs/readme"],
		["/docs/other", 200, "_root_/docs/[...path]"],
		["/guide/intro", 200, "_root_/guide/(g)/intro"],
		["/guide/x", 200, "_root_/guide/[...path]"],
		["/ref/api", 200, "_root_/ref/api"],
		["/ref/x", 200, "_root_/ref/[[...path]]"],
		["/ref", 200, "_root_/ref/[[...path]]"],
	])
})

// What a failed build printed. A build that passed throws.
async function failure(routes: Record<string, string>): Promise<string> {
	return failedBuild(await viteBuild(project(routes)))
}

const ROOT = { "_root_/root.root-layout.tsx": rootLayout("_root_") }

// Each build error fails `vite build` with codegen's message, which names the files.
describe("build errors", () => {
	it("duplicate url", async () => {
		const output = await failure({
			...ROOT,
			"_root_/dashboard/dashboard.page.tsx": page("_root_/dashboard"),
			"_admin_/root.root-layout.tsx": rootLayout("_admin_"),
			"_admin_/dashboard/dashboard.page.tsx": page("_admin_/dashboard"),
		})
		expect(output).toMatch(
			/duplicate url: _admin_\/dashboard\/dashboard\.page\.tsx, _root_\/dashboard\/dashboard\.page\.tsx/,
		)
	})

	it("two pages", async () => {
		const about = { "_root_/about/a.page.tsx": page("_root_/about"), "_root_/about/b.page.tsx": page("_root_/about") }
		expect(await failure({ ...ROOT, ...about })).toContain(
			"two pages: src/routes/_root_/about/b.page.tsx: a folder holds one page; move it to " +
				"src/routes/_root_/about/b/b.page.tsx for /about/b",
		)
	})

	// A build only checks the id; only `vite dev` writes it (routes-dev.test), so the source is as it was.
	it("id mismatch", async () => {
		const root = project({ ...ROOT, "_root_/about/about.page.tsx": page("_root_/abut") })
		expect(failedBuild(await viteBuild(root))).toContain(
			'_root_/about/about.page.tsx: the id string "_root_/abut" is not "_root_/about"',
		)
		expect(readFileSync(join(root, "src/routes/_root_/about/about.page.tsx"), "utf8")).toBe(page("_root_/abut"))
	})

	it("no root", async () => {
		expect(await failure({ "_root_/home.page.tsx": page("_root_/") })).toContain(
			"no root layout for _root_: _root_/home.page.tsx",
		)
	})

	it("bad brackets", async () => {
		const output = await failure({ ...ROOT, "_root_/[user-id]/user.page.tsx": page("_root_/[user-id]") })
		expect(output).toContain("bad brackets: [user-id]")
	})

	it("repeated param", async () => {
		const output = await failure({ ...ROOT, "_root_/[id]/posts/[id]/post.page.tsx": page("_root_/[id]/posts/[id]") })
		expect(output).toContain("_root_/[id]/posts/[id]/post.page.tsx repeated param id")
	})
})

describe("route file errors", () => {
	// The intro's contracts: every route file exports `route`, a layout lives in its own folder, and the builder call is
	// a direct export (routes.md).
	it("route file shape", async () => {
		const missing = await failure({
			...ROOT,
			"_root_/a/a.page.tsx":
				'import { createPage } from "@lovrozagar/flare";\nexport const page = createPage("_root_/a");\n',
		})
		expect(missing).toContain("_root_/a/a.page.tsx: no route export")
		const beside = await failure({
			...ROOT,
			"_root_/b/b.page.tsx": page("_root_/b"),
			"_root_/b/b.layout.tsx": layout("_root_/b"),
		})
		expect(beside).toContain("layout beside page: _root_/b/b.layout.tsx, _root_/b/b.page.tsx")
		const wrapped = await failure({
			...ROOT,
			"_root_/c/c.page.tsx":
				'import { createPage } from "@lovrozagar/flare";\nconst made = createPage("_root_/c").render(() => "c");\nexport const route = made;\n',
		})
		expect(wrapped).toContain("_root_/c/c.page.tsx: createPage must be a direct export")
	})
})

// The root and layout checks codegen runs on every build (plan 21 13.3, BUGS.md 206).
describe("root and layout errors", () => {
	// Each page needs its own root's layout: another root's is not in its chain (plan 21 13.3, BUGS.md 206).
	it("own root missing", async () => {
		const output = await failure({ ...ROOT, "_admin_/admin/admin.page.tsx": page("_admin_/admin") })
		expect(output).toContain("no root layout for _admin_: _admin_/admin/admin.page.tsx")
	})

	// Two layout files for one id would leave the router's layout record one of them (plan 21 13.3, BUGS.md 206).
	it("two layouts for one id", async () => {
		const output = await failure({
			...ROOT,
			"_root_/docs/docs.layout.tsx": layout("_root_/docs"),
			"_root_/docs/second.layout.tsx": layout("_root_/docs"),
			"_root_/docs/intro/intro.page.tsx": page("_root_/docs/intro"),
		})
		expect(output).toContain("two layouts for _root_/docs: _root_/docs/docs.layout.tsx, _root_/docs/second.layout.tsx")
	})
})

// A route module that imports the router closes a cycle through the generated map's lazy import. While its
// evaluation is held open, a second request's import gets its namespace before `route` is set, and dev waits for the
// export, so both requests render. The generated map imports each route module lazily.
it("lazy route module", async () => {
	const root = project({
		...ROOT,
		"_root_/slow/slow.page.tsx": [
			'import { createPage } from "@lovrozagar/flare";',
			'import { router } from "../../../router.ts";',
			'const gate = Reflect.get(globalThis, "__flareRoutesGate");',
			"gate.started();",
			"await gate.released;",
			'export const route = createPage("_root_/slow").render(() => <p id="page">{router === undefined ? "none" : "slow"}</p>);',
			"",
		].join("\n"),
	})
	const started = Promise.withResolvers<void>()
	const released = Promise.withResolvers<void>()
	Reflect.set(globalThis, "__flareRoutesGate", { started: started.resolve, released: released.promise })
	const vite = await createViteServer({
		root,
		configFile: false,
		logLevel: "silent",
		plugins: [flare()],
		server: { middlewareMode: true, hmr: false, ws: false },
	})
	try {
		const generated = readFileSync(join(root, "src/_gen/routes.gen.ts"), "utf8")
		expect(generated).toContain('() => import("../routes/_root_/slow/slow.page.tsx")')
		const ssr = vite.environments["ssr"]
		if (ssr === undefined || !isRunnableDevEnvironment(ssr)) throw new Error("no runnable ssr environment")
		const { server }: { server: Server } = await ssr.runner.import("/src/server.ts")
		const first = get(server, "/slow")
		await started.promise
		const second = get(server, "/slow")
		setTimeout(released.resolve, 200)
		const answers = await Promise.all([first, second])
		expect(answers.map((answer) => [answer.status, answer.page])).toEqual([
			[200, "slow"],
			[200, "slow"],
		])
	} finally {
		Reflect.deleteProperty(globalThis, "__flareRoutesGate")
		await vite.close()
	}
})
