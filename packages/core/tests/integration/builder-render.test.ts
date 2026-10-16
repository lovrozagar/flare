import { createComponent } from "solid-js"
import { Dynamic } from "@solidjs/web"
import { afterAll, expect, it } from "vitest"
import { notFound, unauthenticated, unauthorized } from "../../src/shared/errors/index.ts"
import { createLayout } from "../../src/shared/route-builder/layout.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"
import { bodyOf, documentOf, frames, serve } from "./builder-app.ts"
import { builtServer, fixtureApps, page as pageSource } from "./vite-app.ts"

// dx/builder.md's head, headers, security, render, boundaries, and render props through the real
// createServer(...).fetch (B96): routes made with the real builders, the document and data stream read as they are.

// `.head()` merges parent to child, `{ replace: true }` makes the route's object the whole head, and a throw omits only
// that match's head; the status stays the loader's. A replacing route's `h` frame carries `r` (dx/head.md).
it("head", async () => {
	const area = createLayout("_root_/area")
		.head(() => ({ title: "Area", description: "area description" }))
		.render((props) => props.children)
	const merged = createPage("_root_/area/m")
		.head(() => ({ title: "Merged" }))
		.render(() => "m")
	const replaced = createPage("_root_/area/r")
		.head(() => ({ title: "Replaced" }), { replace: true })
		.render(() => "r")
	const thrown = createPage("_root_/area/t")
		.head(() => {
			throw new Error("head broke")
		})
		.render(() => "t")
	const get = serve(
		[
			{ id: "_root_/area/m", path: "/area/m", module: merged },
			{ id: "_root_/area/r", path: "/area/r", module: replaced },
			{ id: "_root_/area/t", path: "/area/t", module: thrown },
		],
		{ layouts: { "_root_/area": area } },
	)
	const m = (await get("/area/m")).text
	expect(m).toMatch(/<title[^>]*>Merged<\/title>/)
	expect(m).toContain('content="area description"')
	const r = (await get("/area/r")).text
	expect(r).toMatch(/<title[^>]*>Replaced<\/title>/)
	// The head element holds the route's own head; the state script still lists each match's head for the client.
	expect(/<head[^>]*>(.*)<\/head>/s.exec(r)?.[1]).not.toContain("area description")
	expect(frames((await get("/area/r?_flare=data")).text).filter((frame) => frame["t"] === "h")).toEqual([
		{ t: "h", m: "_root_/area", d: { title: "Area", description: "area description" } },
		{ t: "h", m: "_root_/area/r", d: { title: "Replaced" }, r: true },
	])
	const t = await get("/area/t")
	expect(t.status).toBe(200)
	expect(t.text).toMatch(/<title[^>]*>Area<\/title>/)
	const data = frames((await get("/area/m?_flare=data")).text)
	expect(data.filter((frame) => frame["t"] === "h")).toEqual([
		{ t: "h", m: "_root_/area", d: { title: "Area", description: "area description" } },
		{ t: "h", m: "_root_/area/m", d: { title: "Merged" } },
	])
})

// `.headers()` merge parent to child: a child key wins, `set-cookie` appends parent then child, a match whose loader
// threw adds none, a throw omits that match's, and a security header is the server's, whatever a route sets.
it("headers", async () => {
	const area = createLayout("_root_/area")
		.headers(() => ({ "x-area": "layout", "x-kept": "layout", "set-cookie": "a=1" }))
		.render((props) => props.children)
	const page = createPage("_root_/area/p")
		.headers(() => ({ "x-area": "page", "set-cookie": "b=2", "x-frame-options": "ALLOWALL" }))
		.render(() => "p")
	const failed = createPage("_root_/area/f")
		.loader((): { text: string } => {
			throw new Error("loader broke")
		})
		.headers(() => ({ "x-page": "never" }))
		.render(() => "f")
	const thrown = createPage("_root_/area/t")
		.headers(() => {
			throw new Error("headers broke")
		})
		.render(() => "t")
	const get = serve(
		[
			{ id: "_root_/area/p", path: "/area/p", module: page },
			{ id: "_root_/area/f", path: "/area/f", module: failed },
			{ id: "_root_/area/t", path: "/area/t", module: thrown },
		],
		{ layouts: { "_root_/area": area } },
	)
	const p = await get("/area/p")
	expect(p.headers.get("x-area")).toBe("page")
	expect(p.headers.get("x-kept")).toBe("layout")
	expect(p.headers.getSetCookie()).toEqual(["a=1", "b=2"])
	expect(p.headers.get("x-frame-options")).toBe("DENY")
	const f = await get("/area/f")
	expect(f.status).toBe(500)
	expect(f.headers.get("x-page")).toBeNull()
	const t = await get("/area/t")
	expect(t.status).toBe(200)
	expect(t.headers.get("x-area")).toBe("layout")
})

// `.security()` merges outside-in over the server's: a set key replaces, `false` removes, a parent's too; a function
// reads the view context.
it("security", async () => {
	const area = createLayout("_root_/area")
		.security({ "X-Frame-Options": "SAMEORIGIN", "Referrer-Policy": "no-referrer" })
		.render((props) => props.children)
	const page = createPage("_root_/area/p")
		.loader(() => ({ text: "framed" }))
		.security((ctx) => ({ "X-Frame-Options": false, "Cross-Origin-Opener-Policy": ctx.loaderData.text }))
		.render(() => "p")
	const plain = createPage("_root_/area/plain").render(() => "plain")
	const get = serve(
		[
			{ id: "_root_/area/p", path: "/area/p", module: page },
			{ id: "_root_/area/plain", path: "/area/plain", module: plain },
		],
		{ layouts: { "_root_/area": area }, security: { "Referrer-Policy": "same-origin" } },
	)
	const p = await get("/area/p")
	expect(p.headers.get("x-frame-options")).toBeNull()
	expect(p.headers.get("referrer-policy")).toBe("no-referrer")
	expect(p.headers.get("cross-origin-opener-policy")).toBe("framed")
	const plainAnswer = await get("/area/plain")
	expect(plainAnswer.headers.get("x-frame-options")).toBe("SAMEORIGIN")
})

const apps = fixtureApps()

afterAll(() => apps.removeAll())

// A root layout's render writes the document. One that writes no `<html>` or `</body>` is served as written in dev
// (this server, D22) and is an empty 500 in a production build (B37).
it("render document", { timeout: 120_000 }, async () => {
	const bare = createRootLayout("_root_").render((props) =>
		createComponent(Dynamic, { component: "main", children: props.children }),
	)
	const page = createPage("_root_/").render(() => "home")
	const dev = await serve([{ id: "_root_/", path: "/", module: page }], { layouts: { _root_: bare } })("/")
	expect(dev.status).toBe(200)
	expect(dev.text).toMatch(/<main[^>]*>home<\/main>/)
	const whole = await serve([{ id: "_root_/", path: "/", module: page }])("/")
	expect(whole.status).toBe(200)
	expect(bodyOf(whole.text)).toBe("home")
	const built = await builtServer(
		apps.make({
			"src/routes/_root_/root.root-layout.tsx":
				'import { createRootLayout } from "@lovrozagar/flare";\nexport const route = createRootLayout("_root_").render((props) => <main>{props.children}</main>);\n',
			"src/routes/_root_/home.page.tsx": pageSource("_root_/"),
		}),
	)
	const production = await built.fetch(new Request("https://example.com/"))
	expect(production.status).toBe(500)
	expect(await production.text()).toBe("")
})

// A page whose loader throws what `thrown` throws.
function fails(id: string, thrown: () => never) {
	return createPage(id)
		.loader((): { text: string } => thrown())
		.render(() => "never")
}

// A root with its own errorRender, which a throwing errorRender below hands the walk to.
const ERROR_ROOT = createRootLayout("_root_")
	.render((props) => documentOf(props.children))
	.errorRender(() => "root error")

// The walk starts at the failed match and moves to the root; the first with the failure's function paints it in the
// failed match's slot, its own chrome kept; a function that throws is skipped for the next ancestor's; with none, the
// built-in div.
it("boundaries", async () => {
	const area = createLayout("_root_/area")
		.render((props) => ["area[", props.children, "]"])
		.notFoundRender(() => "area missing")
		.errorRender(() => {
			throw new Error("boundary broke")
		})
	const own = createPage("_root_/area/own")
		.loader((): { text: string } => {
			throw notFound()
		})
		.render(() => "never")
		.notFoundRender(() => "own missing")
	const get = serve(
		[
			{
				id: "_root_/area/gone",
				path: "/area/gone",
				module: fails("_root_/area/gone", () => {
					throw notFound()
				}),
			},
			{ id: "_root_/area/own", path: "/area/own", module: own },
			{
				id: "_root_/area/broke",
				path: "/area/broke",
				module: fails("_root_/area/broke", () => {
					throw new Error("x")
				}),
			},
			{
				id: "_root_/area/in",
				path: "/area/in",
				module: fails("_root_/area/in", () => {
					throw unauthenticated()
				}),
			},
			{
				id: "_root_/area/no",
				path: "/area/no",
				module: fails("_root_/area/no", () => {
					throw unauthorized()
				}),
			},
		],
		{ layouts: { _root_: ERROR_ROOT, "_root_/area": area } },
	)
	expect(bodyOf((await get("/area/gone")).text)).toBe("area[area missing]")
	expect(bodyOf((await get("/area/own")).text)).toBe("area[own missing]")
	const broke = await get("/area/broke")
	expect(broke.status).toBe(500)
	expect(bodyOf(broke.text)).toBe("area[root error]")
	expect(await get("/area/in")).toMatchObject({ status: 401 })
	expect(bodyOf((await get("/area/in")).text)).toBe("area[<div>Please log in</div>]")
	expect(bodyOf((await get("/area/no")).text)).toBe("area[<div>Access denied</div>]")
	// An unknown URL is no failed match: under the default `notFoundMode: "root"` the root is the selected layout, and
	// with no `notFoundRender` its outlet is the built-in div.
	expect(bodyOf((await get("/area/unknown")).text)).toBe("<div>Page not found</div>")
})

// With several failing matches the status is the first of 401, 403, 404, 500: a descendant's 401 or 403 outranks an
// ancestor's 500, and a descendant's notFound() does not downgrade it.
it("boundary rank", async () => {
	const area = createLayout("_root_/area")
		.loader((): { text: string } => {
			throw new Error("layout broke")
		})
		.render((props) => props.children)
	const missing = createPage("_root_/area/p")
		.loader((): { text: string } => {
			throw notFound()
		})
		.render(() => "never")
	const get = serve(
		[
			{ id: "_root_/area/p", path: "/area/p", module: missing },
			{
				id: "_root_/area/in",
				path: "/area/in",
				module: fails("_root_/area/in", () => {
					throw unauthenticated()
				}),
			},
			{
				id: "_root_/area/no",
				path: "/area/no",
				module: fails("_root_/area/no", () => {
					throw unauthorized()
				}),
			},
		],
		{ layouts: { "_root_/area": area } },
	)
	expect((await get("/area/p")).status).toBe(500)
	expect((await get("/area/in")).status).toBe(401)
	expect((await get("/area/no")).status).toBe(403)
})

// Render props: this route's params, its search raw or validated, its own loader data (`void` with no loader), the
// preloader context parents outside-in (`{}` when empty), and `children` on a layout.
it("render props", async () => {
	const area = createLayout("_root_/area/[id]")
		.preloader(() => ({ outer: 1 }))
		.loader(() => ({ text: "layout data" }))
		.render((props) => [`layout ${props.loaderData.text} (`, props.children, ")"])
	const page = createPage("_root_/area/[id]/p").render((props) =>
		JSON.stringify({
			params: props.params,
			search: props.search,
			loaderData: props.loaderData ?? null,
			preloaderContext: props.preloaderContext,
		}),
	)
	const validated = createPage("_root_/v")
		.input({ searchParams: (raw: Record<string, string | string[]>) => ({ n: Number(raw["n"]) }) })
		.render((props) => JSON.stringify({ search: props.search, preloaderContext: props.preloaderContext }))
	const get = serve(
		[
			{ id: "_root_/area/[id]/p", path: "/area/[id]/p", module: page },
			{ id: "_root_/v", path: "/v", module: validated },
		],
		{ layouts: { "_root_/area/[id]": area } },
	)
	expect(bodyOf((await get("/area/7/p?q=a")).text)).toBe(
		`layout layout data (${JSON.stringify({ params: { id: "7" }, search: { q: "a" }, loaderData: null, preloaderContext: { outer: 1 } })})`,
	)
	expect(bodyOf((await get("/v?n=3")).text)).toBe(JSON.stringify({ search: { n: 3 }, preloaderContext: {} }))
})

// A root whose own loader throws notFound() on /broken.
const failingRoot = createRootLayout("_root_")
	.loader(({ request }) => {
		if (new URL(request.url).pathname === "/broken") throw notFound()
		return {}
	})
	.render((props) => documentOf(props.children))

const FAILING_ROOT_SOURCE = [
	'import { createRootLayout, notFound } from "@lovrozagar/flare";',
	'export const route = createRootLayout("_root_")',
	'\t.loader(({ request }) => { if (new URL(request.url).pathname === "/broken") throw notFound(); return {}; })',
	"\t.render((props) => <html><head><title>t</title></head><body>{props.children}</body></html>);",
	"",
].join("\n")

// The shape of an answer for a failed root: its status, whether it is a whole document after the doctype, and its body.
function documentShape(status: number, text: string): { status: number; document: boolean; body: string } {
	const document =
		text.startsWith("<!DOCTYPE html><html") &&
		/<head[^>]*>.*<\/head><body[^>]*>/s.test(text) &&
		text.endsWith("</html>")
	return { status, document, body: bodyOf(text) }
}

// A failed root's answer is a document whose body is the built-in div: the doctype, so a browser renders it in
// standards mode, and a head and body the state and client scripts go into (B77, BUGS.md 134).
const ROOT_FAILURE = { status: 404, document: true, body: "<div>Page not found</div>" }

// A failed root paints the built-in div as the body of a minimal document, in dev and in a production build.
it("boundary root", { timeout: 120_000 }, async () => {
	const page = createPage("_root_/broken").render(() => "never")
	const dev = await serve([{ id: "_root_/broken", path: "/broken", module: page }], {
		layouts: { _root_: failingRoot },
	})("/broken")
	expect(documentShape(dev.status, dev.text)).toEqual(ROOT_FAILURE)
	const built = await builtServer(
		apps.make({
			"src/routes/_root_/root.root-layout.tsx": FAILING_ROOT_SOURCE,
			"src/routes/_root_/broken/broken.page.tsx": pageSource("_root_/broken"),
		}),
	)
	const production = await built.fetch(new Request("https://example.com/broken"))
	expect(documentShape(production.status, await production.text())).toEqual(ROOT_FAILURE)
})
