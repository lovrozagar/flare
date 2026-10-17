import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createServer as createViteServer, isRunnableDevEnvironment } from "vite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { flare } from "../../src/vite/plugin/flare.ts"
import { builtServer, fixtureApps, page, rootLayout, viteBuild, type Server } from "./vite-app.ts"

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

// What a failed build printed. A build that passed throws.
async function failure(routes: Record<string, string>): Promise<string> {
	const built = await viteBuild(project(routes))
	if (built.status === 0) throw new Error("the build passed")
	return built.output
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

	it("shadow", async () => {
		const output = await failure({
			...ROOT,
			"_root_/docs/[...path]/docs.page.tsx": page("_root_/docs/[...path]"),
			"_root_/docs/readme/readme.page.tsx": page("_root_/docs/readme"),
		})
		expect(output).toMatch(
			/shadow: _root_\/docs\/\[\.\.\.path\]\/docs\.page\.tsx, _root_\/docs\/readme\/readme\.page\.tsx/,
		)
	})

	it("two pages", async () => {
		const about = { "_root_/about/a.page.tsx": page("_root_/about"), "_root_/about/b.page.tsx": page("_root_/about") }
		expect(await failure({ ...ROOT, ...about })).toMatch(
			/two pages: _root_\/about\/a\.page\.tsx, _root_\/about\/b\.page\.tsx/,
		)
	})

	// A build only checks the id; only `vite dev` writes it (routes-dev.test), so the source is as it was.
	it("id mismatch", async () => {
		const root = project({ ...ROOT, "_root_/about/about.page.tsx": page("_root_/abut") })
		const built = await viteBuild(root)
		expect(built.status).not.toBe(0)
		expect(built.output).toContain('_root_/about/about.page.tsx: the id string "_root_/abut" is not "_root_/about"')
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
