import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createComponent, type Element } from "solid-js"
import { Dynamic } from "@solidjs/web"
import { afterEach, expect, it, vi } from "vitest"
import { acceptSeed } from "../../server/cache/seed.ts"
import { serveWith } from "../../server/lifecycle/create.ts"
import type { Logger } from "../../server/lifecycle/logger.ts"
import type { RuntimeOptions } from "../../server/lifecycle/options.ts"
import { prerendererOf, type Prerenderer } from "../../shared/protocol/prerender.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter, type RouteModule } from "../../shared/router/create-router.ts"
import type { AuthHint } from "../codegen/auth-hint.ts"
import { createBuilder } from "vite"
import { flare } from "../plugin/flare.ts"
import type { FlareOptions } from "../plugin/options.ts"
import { hintsOf, runPrerender, type RunInput } from "./run.ts"

const SITE = "https://example.com"
const FIXTURES = fileURLToPath(new URL("../../../../../node_modules/.flare-fixtures/", import.meta.url))

const roots: string[] = []

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function noop(): void {}

const quiet: Logger = { level: "error", error: noop, warn: noop, log: noop }
// A stored body is a whole document, so the root renders `<html>`, `<head>`, and `<body>`.
function documentOf(children: Element): Element {
	return createComponent(Dynamic, {
		component: "html",
		get children() {
			return [
				createComponent(Dynamic, { component: "head" }),
				createComponent(Dynamic, { component: "body", children }),
			]
		},
	})
}

const root = createRootLayout("_root_").render((props) => documentOf(props.children))

type Page = { id: string; path: string; module: RouteModule }

// A server over these pages, and its prerenderer with every render counted.
function server(pages: readonly Page[], extra: Partial<RuntimeOptions> = {}): { pre: Prerenderer; renders: string[] } {
	const router = createRouter({ layouts: { _root_: root }, routeTree: [...pages] })
	const found = prerendererOf(serveWith({ router, site: SITE, ...extra }, { dev: false, log: quiet }))
	if (found === undefined) throw new Error("no prerenderer")
	const renders: string[] = []
	const pre: Prerenderer = {
		site: found.site,
		pages: () => found.pages(),
		routes: () => found.routes(),
		params: (id) => found.params(id),
		render: (input) => {
			renders.push(`${input.id} ${JSON.stringify(input.params)}`)
			return found.render(input)
		},
	}
	return { pre, renders }
}

// The hint codegen would give: the same as the runtime unless a test says otherwise.
const truthful = (pre: Prerenderer) => async (): Promise<RunInput["hint"]> => {
	const pages = await pre.pages()
	return (id) => {
		const auth = pages.find((page) => page.id === id)?.auth
		return auth?.requires ? "requires" : auth?.reads ? "reads" : "public"
	}
}

async function run(pre: Prerenderer, config: RunInput["config"] = {}, hint?: RunInput["hint"]) {
	const written: string[] = []
	const result = await runPrerender({
		prerenderer: pre,
		config,
		hint: hint ?? (await truthful(pre)()),
		write: async (key) => void written.push(key),
		writeFile: async (name) => void written.push(name),
	})
	return { ...result, written }
}

const page = (id: string, path: string, module: RouteModule): Page => ({ id, path, module })
const ssg = (id: string, path: string, text = "page"): Page =>
	page(
		id,
		path,
		createPage(id)
			.cache({ ssg: true })
			.render(() => text),
	)

// A fixture app under the repo's node_modules, so its imports resolve as an app's would.
function fixture(files: Record<string, string>): string {
	mkdirSync(FIXTURES, { recursive: true })
	const app = mkdtempSync(join(FIXTURES, "prerender-"))
	roots.push(app)
	const base: Record<string, string> = {
		"src/client.tsx":
			'import { createClient } from "@lovrozagar/flare/client";\nimport { router } from "./router.ts";\ncreateClient(router);\n',
		"src/router.ts":
			'import { createRouter } from "@lovrozagar/flare";\nimport { chunks, layouts, routeTree } from "./_gen/routes.gen.ts";\nexport const router = createRouter({ layouts, routeTree, chunks });\n',
		"src/server.ts": `import { createServer } from "@lovrozagar/flare/server";\nimport { router } from "./router.ts";\nexport const server = createServer({ router, site: "${SITE}" });\n`,
		"src/routes/_root_/root.root-layout.tsx":
			'import { createRootLayout } from "@lovrozagar/flare";\nexport const route = createRootLayout("_root_").render((props) => (\n\t<html>\n\t\t<head></head>\n\t\t<body>{props.children}</body>\n\t</html>\n));\n',
	}
	for (const [path, text] of Object.entries({ ...base, ...files })) {
		mkdirSync(dirname(join(app, path)), { recursive: true })
		writeFileSync(join(app, path), text)
	}
	return app
}

function build(app: string, prerender: FlareOptions["prerender"] = true): Promise<void> {
	return createBuilder({ root: app, configFile: false, logLevel: "silent", plugins: flare({ prerender }) }).then(
		(builder) => builder.buildApp(),
	)
}

// A real build with `prerender: true`: the seed is written through the write path, the build's own id names its
// directory, and the assets store of that build reads it. A failing page fails the build by name, and a server
// entry with no `server` fails it too. A sitemap lands at the client output root (dx/seo.md).
it("200", async () => {
	const app = fixture({
		"src/routes/_root_/about/about.page.tsx":
			'import { createPage } from "@lovrozagar/flare";\nexport const route = createPage("_root_/about").cache({ ssg: true }).render(() => "about page");\n',
	})
	await build(app, { sitemap: { robotsTxt: true } })
	expect(readFileSync(join(app, "dist/client/sitemap.xml"), "utf8")).toContain(`<loc>${SITE}/about</loc>`)
	expect(readFileSync(join(app, "dist/client/robots.txt"), "utf8")).toBe(`Sitemap: ${SITE}/sitemap.xml\n`)
	const dir = join(app, "dist/client/assets/_flare-static")
	const [id] = readdirSync(dir)
	const [file] = readdirSync(join(dir, id ?? ""))
	const json: unknown = JSON.parse(readFileSync(join(dir, id ?? "", file ?? ""), "utf8"))
	const seed = acceptSeed(json, `static:${id}:_root_/about`)
	expect(String(Reflect.get(Object(seed?.data), "html"))).toContain("about page")
	expect(id).toMatch(/^[0-9a-f]{12}$/)
	const guarded = fixture({
		"src/routes/_root_/g/g.page.tsx":
			'import { createPage } from "@lovrozagar/flare";\nexport const route = createPage("_root_/g").cache({ ssg: true }).authorize(() => true).render(() => "g");\n',
	})
	await expect(build(guarded)).rejects.toThrow(/prerender failed[\s\S]*_root_\/g has authorize/)
	const bare = fixture({ "src/server.ts": "export const other = 1;\n", "src/client.tsx": "console.log(1);\n" })
	await expect(build(bare)).rejects.toThrow(/exports no server/)
}, 120_000)

// A chain that requires auth, on the page or a layout, is never stored, so the build fails and writes nothing.
it("401", async () => {
	const pre = server([
		ssg("_root_/a", "/a"),
		page(
			"_root_/private",
			"/private",
			createPage("_root_/private")
				.cache({ ssg: true })
				.authenticate()
				.render(() => "x"),
		),
	]).pre
	const result = await run(pre)
	expect(result.code).toBe(1)
	expect(result.stderr.join("\n")).toContain("_root_/private")
	expect(result.written).toEqual([])
})

it("500", async () => {
	const broken = createPage("_root_/broken")
		.cache({ ssg: true })
		.loader(() => {
			throw new Error("down")
		})
		.render(() => "x")
	const result = await run(server([page("_root_/broken", "/broken", broken)]).pre)
	expect(result.code).toBe(1)
	expect(result.stderr.join("\n")).toMatch(/_root_\/broken.*500/)
	expect(result.stderr.join("\n")).not.toContain("Workers binding")
	// A Workers app prerenders on Node, where no Workers binding exists, so its failure names that cause and the fix
	// (B109).
	const workers = await runPrerender({
		prerenderer: server([page("_root_/broken", "/broken", broken)]).pre,
		config: {},
		hint: () => undefined,
		write: async () => undefined,
		writeFile: async () => undefined,
		workers: true,
	})
	expect(workers.stderr).toEqual([
		"[flare:prerender] _root_/broken {} answered 500: prerender runs the server on Node at build time, with no " +
			"Workers binding (KV, D1, R2, caches). A route whose loader needs one cannot be prerendered: mark it ssr or isr",
	])
})

// Codegen's hint and the loaded modules' effective auth must agree (B25). A mismatch fails before any render.
it("hint mismatch", async () => {
	const { pre, renders } = server([ssg("_root_/a", "/a")])
	const result = await run(pre, {}, (): AuthHint => "requires")
	expect(result.code).toBe(1)
	expect(result.stderr.join("\n")).toMatch(/_root_\/a.*hint/)
	expect(renders).toEqual([])
	// The hint is codegen's scan of the chain's files: a layout that authenticates makes its pages `requires`.
	const app = fixture({
		"src/routes/_root_/team/team.layout.tsx":
			'export const route = createLayout("_root_/team").authenticate().render((props) => props.children);\n',
		"src/routes/_root_/team/home/home.page.tsx":
			'export const route = createPage("_root_/team/home").render(() => "x");\n',
		"src/routes/_root_/open/open.page.tsx":
			'export const route = createPage("_root_/open").authorize(() => true).render(() => "x");\n',
	})
	const hint = hintsOf(app)
	expect(hint("_root_/team/home")).toBe("requires")
	expect(hint("_root_/open")).toBe("reads")
	expect(hint("_root_/unknown")).toBeUndefined()
	// An app with no route files has no hint to disagree with.
	expect(hintsOf(join(fixture({}), "none"))("_root_/x")).toBeUndefined()
})

// The populate request is `site` plus the pathname: no search, no cookie, no authorization, no copied headers.
it("credential less", async () => {
	const seen: Request[] = []
	const watched = createPage("_root_/w")
		.cache({ ssg: true })
		.loader(({ request }) => {
			seen.push(request)
			return {}
		})
		.render(() => "w")
	const result = await run(server([page("_root_/w", "/w", watched)]).pre)
	expect(result.code).toBe(0)
	expect(seen.map((request) => request.url)).toEqual([`${SITE}/w`])
	expect([...(seen[0]?.headers.keys() ?? [])]).toEqual([])
})

// Only the slugs `params()` lists are rendered and written.
it("dynamic false", async () => {
	const listed = createPage("_root_/i/[id]")
		.cache({ isr: { params: () => [{ id: "1" }], dynamicParams: false } })
		.render(() => "i")
	const { pre, renders } = server([page("_root_/i/[id]", "/i/[id]", listed)])
	const result = await run(pre)
	expect(renders).toEqual(['_root_/i/[id] {"id":"1"}'])
	expect(result.written).toEqual(["static:dev:_root_/i/[id]:1"])
})

it("defer rejected", async () => {
	const late = createPage("_root_/late")
		.cache({ ssg: { defer: "resolve" } })
		.loader(({ defer }) => ({ late: defer(() => Promise.reject(new Error("late"))) }))
		.render(() => "late")
	const result = await run(server([ssg("_root_/a", "/a"), page("_root_/late", "/late", late)]).pre)
	expect(result.code).toBe(1)
	expect(result.stderr.join("\n")).toContain("_root_/late")
	expect(result.written).toEqual([])
})

// A dynamic page needs its own `params`: no parent provides them (dx/cache.md).
it("missing params", async () => {
	const { pre, renders } = server([ssg("_root_/p/[slug]", "/p/[slug]")])
	const result = await run(pre)
	expect(result.code).toBe(1)
	expect(result.stderr.join("\n")).toMatch(/_root_\/p\/\[slug\].*params/)
	expect(renders).toEqual([])
})

// Without `static`, an ssg page renders per request, and the server reports it once, at error level so production
// shows it (B89).
it("no static store", async () => {
	const error = vi.fn<Logger["error"]>()
	const router = createRouter({ layouts: { _root_: root }, routeTree: [ssg("_root_/s", "/s", "static")] })
	const app = serveWith({ router }, { dev: false, log: { ...quiet, error } })
	for (let index = 0; index < 2; index += 1) {
		expect(await (await app.fetch(new Request("http://localhost/s"))).text()).toContain("static")
	}
	expect(error).toHaveBeenCalledTimes(1)
	expect(error).toHaveBeenCalledWith("cache", expect.stringContaining("_root_/s"))
})

// One route renders at a time unless `concurrency` says more.
it("concurrency", async () => {
	let live = 0
	let most = 0
	const slow = createPage("_root_/p/[n]")
		.cache({ ssg: () => [{ n: "1" }, { n: "2" }, { n: "3" }] })
		.loader(async () => {
			live += 1
			most = Math.max(most, live)
			await new Promise((resolve) => setTimeout(resolve, 10))
			live -= 1
			return {}
		})
		.render(() => "n")
	const pages = [page("_root_/p/[n]", "/p/[n]", slow)]
	expect((await run(server(pages).pre)).code).toBe(0)
	expect(most).toBe(1)
	most = 0
	expect((await run(server(pages).pre, { concurrency: 2 })).code).toBe(0)
	expect(most).toBe(2)
})

// A function is called once, when prerender starts, and every render gets its record as `env`.
it("env", async () => {
	const envs: unknown[] = []
	const read = createPage("_root_/e")
		.cache({ ssg: true })
		.loader(({ env }) => {
			envs.push(env)
			return {}
		})
		.render(() => "e")
	const make = vi.fn<() => Record<string, unknown>>(() => ({ TOKEN: "t" }))
	const result = await run(server([page("_root_/e", "/e", read), ssg("_root_/f", "/f")]).pre, { env: make })
	expect(result.code).toBe(0)
	expect(make).toHaveBeenCalledTimes(1)
	expect(envs).toEqual([{ TOKEN: "t" }])
	expect((await run(server([page("_root_/e", "/e", read)]).pre, { env: { TOKEN: "u" } })).code).toBe(0)
	expect(envs.at(-1)).toEqual({ TOKEN: "u" })
})

it("exclude", async () => {
	const { pre, renders } = server([ssg("_root_/a", "/a"), ssg("_root_/b", "/b")])
	const result = await run(pre, { exclude: ["_root_/b"] })
	expect(result.code).toBe(0)
	expect(renders).toEqual(["_root_/a {}"])
})

// An ssg route, or an isr route with params, needs `prerender`. The error names the route and nothing is written.
it("prerender off", async () => {
	const { pre, renders } = server([ssg("_root_/a", "/a")])
	const result = await run(pre, false)
	expect(result.code).toBe(1)
	expect(result.stderr.join("\n")).toMatch(/_root_\/a.*prerender/)
	expect(renders).toEqual([])
	expect(result.written).toEqual([])
	// An app with no such route still builds.
	expect((await run(server([]).pre, false)).code).toBe(0)
})

// `isr: true` and `isr: {}` are on-demand: not rendered at build, and they need no `prerender`.
it("isr true", async () => {
	const open = createPage("_root_/open")
		.cache({ isr: true })
		.render(() => "open")
	const { pre, renders } = server([page("_root_/open", "/open", open)])
	expect((await run(pre, false)).code).toBe(0)
	expect(renders).toEqual([])
})

it("isr empty", async () => {
	const open = createPage("_root_/empty")
		.cache({ isr: {} })
		.render(() => "empty")
	const { pre, renders } = server([page("_root_/empty", "/empty", open)])
	expect((await run(pre, false)).code).toBe(0)
	expect(renders).toEqual([])
})

it("authorize", async () => {
	const guarded = createPage("_root_/g")
		.cache({ ssg: true })
		.authorize(() => true)
		.render(() => "g")
	const { pre, renders } = server([page("_root_/g", "/g", guarded)])
	const result = await run(pre)
	expect(result.code).toBe(1)
	expect(result.stderr.join("\n")).toMatch(/_root_\/g.*authorize/)
	expect(renders).toEqual([])
})

// `authenticateOptional` without `authorize` prerenders the anonymous body: the request carries no credential.
it("optional auth", async () => {
	const optional = createPage("_root_/o")
		.cache({ ssg: true })
		.authenticateOptional()
		.loader(({ auth }) => ({ who: auth === null ? "anonymous" : "user" }))
		.render(() => "o")
	const pre = server([page("_root_/o", "/o", optional)], {
		authenticate: ({ request }) => (request.headers.has("cookie") ? { id: "u" } : null),
	}).pre
	const result = await run(pre)
	expect(result.code).toBe(0)
	expect(result.written).toEqual(["static:dev:_root_/o"])
	const rendered = await pre.render({ id: "_root_/o", params: {}, env: {} })
	expect(JSON.stringify(rendered.entry?.data)).toContain("anonymous")
})

// A prerender request runs middleware. A redirect there fails the build by name, so a seed never holds a page the
// middleware would have changed.
const moved = (): Response => Response.redirect(`${SITE}/elsewhere`, 302)

it("middleware runs", async () => {
	const result = await run(server([ssg("_root_/a", "/a")], { middleware: [moved] }).pre)
	expect(result.code).toBe(1)
	expect(result.stderr.join("\n")).toMatch(/_root_\/a.*302/)
	expect(result.written).toEqual([])
})
