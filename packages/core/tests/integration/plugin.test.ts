import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import { resolveConfig } from "vite"
import { afterAll, beforeAll, expect, it } from "vitest"
import { flare } from "../../src/vite/plugin/flare.ts"
import type { FlareOptions } from "../../src/vite/plugin/options.ts"
import { builtServer, failedBuild, fixtureApps, page, viteBuild, type Server } from "./vite-app.ts"
import { stateIn } from "../../src/server/wire.fixture.ts"

// dx/plugin.md's options through real apps (B96): an app with every option set and one with the defaults, each built
// by `vite build` with flare() from a config file, as the CLI runs it, then read from its output and answered by its
// built server. A rejected option is the real Vite config resolution throwing.

const apps = fixtureApps()

afterAll(() => apps.removeAll())

const FONTS = fileURLToPath(new URL("../e2e/apps/docs/assets/fonts", import.meta.url))

function config(options: string): string {
	return `import { flare } from "@lovrozagar/flare/vite";\nexport default { logLevel: "error", plugins: [flare(${options})] };\n`
}

// An ssg page whose preloader logs when it starts and ends, and returns the prerender env's FLAVOR.
function slow(id: string): string {
	const log = (word: string) => `fs.appendFileSync("prerender.log", "${word} ${id} " + Date.now() + "\\n")`
	return page(
		id,
		`.cache({ ssg: true }).preloader(async ({ env }) => { const fs = await import("node:fs"); ${log("start")}; await new Promise((r) => setTimeout(r, 300)); ${log("end")}; return { flavor: String(Reflect.get(Object(env), "FLAVOR")) } })`,
	)
}

// The theme provider brings the cross-tab sync, whose channel `broadcast` turns off.
const ROOT_LAYOUT = [
	'import { createRootLayout, Stylesheet, ThemeProvider } from "@lovrozagar/flare";',
	'export const route = createRootLayout("_root_").render((props) => <html><head><title>t</title><Stylesheet /></head><body><ThemeProvider>{props.children}</ThemeProvider></body></html>);',
	"",
].join("\n")

const ROUTES: Record<string, string> = {
	"src/routes/_root_/root.root-layout.tsx": ROOT_LAYOUT,
	"src/routes/_root_/home.page.tsx": [
		'import { createPage, Image } from "@lovrozagar/flare";',
		'import hero from "../../assets/hero.png?image";',
		'import raw from "../../assets/raw.png?image";',
		'import logo from "../../assets/logo.svg";',
		'export const route = createPage("_root_/").render(() => <main><Image src={hero} alt="hero" sizes="100vw" /><Image src={raw} alt="raw" /><img id="logo" src={logo} alt="" /></main>);',
		"",
	].join("\n"),
	"src/routes/_root_/turned/turned.page.tsx": [
		'import { createPage, Image } from "@lovrozagar/flare";',
		'import turned from "../../../assets/turned.jpg?image";',
		'export const route = createPage("_root_/turned").render(() => <main><Image src={turned} alt="turned" /><p id="size">{turned.width}x{turned.height}</p></main>);',
		"",
	].join("\n"),
	"src/components/plain.jsx": 'export function Plain() {\n\treturn <b id="plain">from jsx</b>;\n}\n',
	"src/routes/_root_/jsx/jsx.page.tsx": [
		'import { createPage } from "@lovrozagar/flare";',
		'import { Plain } from "../../../components/plain.jsx";',
		'export const route = createPage("_root_/jsx").render(() => <main><Plain /></main>);',
		"",
	].join("\n"),
	"src/routes/_root_/b/b.page.tsx": slow("_root_/b"),
	"src/routes/_root_/c/c.page.tsx": slow("_root_/c"),
	"src/routes/_root_/d/d.page.tsx": slow("_root_/d"),
	"src/routes/_root_/skipped/skipped.page.tsx": page("_root_/skipped", ".cache({ ssg: true })"),
	"src/app.css": "body { color: rebeccapurple; }\n",
	"src/router.ts": [
		'import { createRouter } from "@lovrozagar/flare";',
		'import { chunks, layouts, routeTree } from "./_gen/routes.gen.ts";',
		"export const router = createRouter({ layouts, routeTree, chunks, theme: {} });",
		"",
	].join("\n"),
}

const OPTIONS = `{
	assetsBase: "/static",
	entry: { client: "app/main.tsx", server: "app/server.ts" },
	image: { widths: [320, 640], quality: 40, exclude: /raw/ },
	css: { reset: true },
	broadcast: false,
	fonts: { dir: "assets/fonts" },
	prerender: { concurrency: 2, env: () => ({ FLAVOR: "built" }), exclude: ["_root_/skipped"] },
}`

// A server on `site` whose responses name the file it was built from.
function serverEntry(router: string, name: string): string {
	return [
		'import { createMiddleware, createServer } from "@lovrozagar/flare/server";',
		`import { router } from "${router}";`,
		`const entry = createMiddleware(async (ctx) => { const response = await ctx.next(); response.headers.set("x-entry", "${name}"); });`,
		'export const server = createServer({ router, site: "https://flare.test", middleware: [entry] });',
		"",
	].join("\n")
}

function clientEntry(css: string, router: string, extra = ""): string {
	return [
		`import "${css}";`,
		'import "@lovrozagar/flare/fonts/inter";',
		'import { createClient } from "@lovrozagar/flare/client";',
		`import { router } from "${router}";`,
		extra,
		"createClient(router);",
		"",
	].join("\n")
}

// The options app's own entries, outside src; its src/client.tsx and src/server.ts are the shell's, unused.
const APP_ENTRIES: Record<string, string> = {
	"app/main.tsx": clientEntry("../src/app.css", "../src/router.ts", 'console.info("custom client entry");'),
	"app/server.ts": serverEntry("../src/router.ts", "app"),
}

const DEFAULT_ENTRIES: Record<string, string> = {
	"src/client.tsx": clientEntry("./app.css", "./router.ts"),
	"src/server.ts": serverEntry("./router.ts", "src"),
}

type App = { root: string; server: Server }

// An app with a 1000 by 600 image twice and the docs app's font files, built.
async function made(files: Record<string, string>): Promise<App> {
	const root = apps.make(files)
	mkdirSync(join(root, "src/assets"), { recursive: true })
	const png = await sharp({ create: { width: 1000, height: 600, channels: 3, background: "#3366cc" } })
		.png()
		.toBuffer()
	writeFileSync(join(root, "src/assets/hero.png"), png)
	// 1200 by 800 pixels, stored turned: EXIF orientation 6 shows it 800 wide and 1200 tall.
	const jpeg = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#cc6633" } })
		.withMetadata({ orientation: 6 })
		.jpeg()
		.toBuffer()
	writeFileSync(join(root, "src/assets/turned.jpg"), jpeg)
	writeFileSync(join(root, "src/assets/raw.png"), png)
	// Over Vite's 4 KiB inline limit, so it is a file.
	writeFileSync(
		join(root, "src/assets/logo.svg"),
		`<svg xmlns="http://www.w3.org/2000/svg"><!-- ${"x".repeat(5000)} --></svg>`,
	)
	cpSync(FONTS, join(root, "assets/fonts"), { recursive: true })
	return { root, server: await builtServer(root) }
}

let options: App | undefined
let defaults: App | undefined

beforeAll(async () => {
	;[options, defaults] = await Promise.all([
		made({ ...ROUTES, ...APP_ENTRIES, "vite.config.mjs": config(OPTIONS) }),
		made({ ...ROUTES, ...DEFAULT_ENTRIES, "vite.config.mjs": config("{ prerender: true, image: {} }") }),
	])
})

function built(app: App | undefined): App {
	if (app === undefined) throw new Error("the app did not build")
	return app
}

// The client output's files, root-relative.
function clientFiles(app: App | undefined): string[] {
	const dir = join(built(app).root, "dist", "client")
	return readdirSync(dir, { recursive: true, encoding: "utf8" })
		.filter((path) => statSync(join(dir, path)).isFile())
		.map((path) => relative(dir, join(dir, path)))
		.sort()
}

function clientFile(app: App | undefined, path: string | undefined): Buffer {
	if (path === undefined) throw new Error("no such file")
	return readFileSync(join(built(app).root, "dist", "client", path))
}

// Every client JavaScript file's text.
function clientCode(app: App | undefined): string {
	return clientFiles(app)
		.filter((path) => path.endsWith(".js"))
		.map((path) => clientFile(app, path).toString())
		.join("\n")
}

async function home(app: App | undefined): Promise<{ html: string; entry: string | null }> {
	const response = await built(app).server.fetch(new Request("https://flare.test/"))
	return { entry: response.headers.get("x-entry"), html: await response.text() }
}

// Built files and the document's client import under `assetsBase`; `/assets` by default. The URL the server renders
// for an imported asset is a file the client build wrote (BUGS.md 132). Also the client entry's and chunks' names and the build id (dx/plugin.md
// Build output, Client entry, Build id).
it("assets base", async () => {
	const entry = clientFiles(options).find((path) => /^static\/client-[\w-]+\.js$/.test(path))
	expect(entry).toBeDefined()
	expect((await home(options)).html).toContain(`import("/${entry}")`)
	for (const app of [options, defaults]) {
		const logo = /<img id="logo" src="\/([^"]+)"/.exec((await home(app)).html)?.[1]
		expect(clientFiles(app)).toContain(logo)
	}
	expect(clientFiles(options).filter((path) => path.startsWith("assets/"))).toEqual([])
	expect((await home(defaults)).html).toMatch(/import\("\/assets\/client-[\w-]+\.js"\)/)
	// The build id is 12 hex digits of a hash over what the build wrote, so two apps whose client files differ differ
	// (dx/plugin.md Build id).
	const ids = await Promise.all(
		[options, defaults].map(async (app) =>
			(await built(app).server.fetch(new Request("https://flare.test/"))).headers.get("flare-build"),
		),
	)
	expect(ids.map((id) => /^[\da-f]{12}$/.test(String(id)))).toEqual([true, true])
	expect(ids[0]).not.toBe(ids[1])
})

// A source stored turned, EXIF orientation 6, is upright in the build: each variant is as tall as the original is shown
// and carries no orientation of its own, and the import's intrinsic size is the upright one (dx/plugin.md Image
// orientation, BUGS.md 191).
it("image orientation", async () => {
	const turned = clientFiles(options).filter((path) => /^static\/turned-\d+-[\da-f]{8}\.webp$/.test(path))
	expect(turned).toHaveLength(2)
	for (const path of turned) {
		const meta = await sharp(clientFile(options, path)).metadata()
		expect([path, meta.height > meta.width, meta.orientation]).toEqual([path, true, undefined])
	}
	const html = await (await built(options).server.fetch(new Request("https://flare.test/turned"))).text()
	expect(/<p[^>]*id="size"[^>]*>(.*?)<\/p>/.exec(html)?.[1]?.replaceAll(/<!--.*?-->/g, "")).toBe("800x1200")
})

// flare() calls solid() itself, with `ssr: true` and `.jsx` among its extensions: a `.jsx` component compiles and renders,
// and the served markup carries the hydration keys an SSR compile writes (dx/plugin.md Solid). `solid` is no flare()
// option: options.test types it out and `options checked` refuses it.
it("solid", async () => {
	for (const app of [options, defaults]) {
		const html = await (await built(app).server.fetch(new Request("https://flare.test/jsx"))).text()
		expect(html).toMatch(/<b [^>]*id="plain"[^>]*>from jsx<\/b>/)
		expect(/<b [^>]*id="plain"[^>]*>/.exec(html)?.[0]).toMatch(/ _hk=/)
	}
})

// `entry.client` and `entry.server` are the app's files: the built server is app/server.ts, and the client bundle holds
// app/main.tsx.
it("entries", async () => {
	expect((await home(options)).entry).toBe("app")
	expect((await home(defaults)).entry).toBe("src")
	expect(clientCode(options)).toContain("custom client entry")
})

// Optimized webp at the configured widths only, at the configured quality; an excluded file is copied unchanged.
// `image: {}` is the defaults: every default width up to the source's 1000 px, quality 75.
it("image", async () => {
	const webp = (app: App | undefined) => clientFiles(app).filter((path) => path.endsWith(".webp"))
	const names = (app: App | undefined) => webp(app).map((path) => path.replace(/-[\da-f]{8}\.webp$/, ""))
	expect(names(options)).toEqual(["static/hero-320", "static/hero-640", "static/turned-320", "static/turned-640"])
	expect(clientFiles(options).filter((path) => path.endsWith(".png"))).toHaveLength(1)
	const html = (await home(options)).html
	expect(html).toMatch(/\/static\/hero-320-[\da-f]{8}\.webp 320w, \/static\/hero-640-[\da-f]{8}\.webp 640w/)
	// Vite keeps the import's query on the copied file's URL; a file server ignores it.
	const raw = /<img[^>]*alt="raw"[^>]*src="\/([^"?]+)\?image"/.exec(html)?.[1]
	expect(raw).toMatch(/^static\/raw-[\w-]+\.png$/)
	expect(clientFiles(options)).toContain(raw)
	const widths = ["640", "750", "828"]
	expect(names(defaults)).toEqual([
		...widths.map((width) => `assets/hero-${width}`),
		...widths.map((width) => `assets/raw-${width}`),
		"assets/turned-640",
		"assets/turned-750",
	])
	const at640 = (app: App | undefined) =>
		clientFile(
			app,
			webp(app).find((path) => path.includes("hero-640")),
		).length
	expect(at640(options)).toBeLessThan(at640(defaults))
})

// The client output's stylesheets, as one text.
function sheet(app: App | undefined): string {
	return clientFiles(app)
		.filter((path) => path.endsWith(".css"))
		.map((path) => clientFile(app, path).toString())
		.join("")
}

// The home document's critical style block.
async function critical(app: App | undefined): Promise<string> {
	return /<style id="flare-critical"[^>]*>(.*?)<\/style>/s.exec((await home(app)).html)?.[1] ?? ""
}

// `reset: true` prepends the preflight to the stylesheet, and the document's critical block carries its rules.
it("css reset", async () => {
	expect(sheet(options)).toContain("box-sizing:border-box")
	expect(await critical(options)).toContain("box-sizing:border-box")
	expect(sheet(defaults)).not.toContain("box-sizing")
	expect(await critical(defaults)).toBe("body{color:#639}")
})

// A built document's critical style and stylesheet swap script carry the CSP header's nonce, as every tag Flare writes
// does (`nonce.test.ts`): the critical style and the swap exist only in a server build.
it("critical and swap nonce", async () => {
	const response = await built(defaults).server.fetch(new Request("https://flare.test/"))
	const html = await response.text()
	const header = /'nonce-([^']+)'/.exec(response.headers.get("content-security-policy") ?? "")?.[1]
	const critical = /<style id="flare-critical" nonce="([^"]+)"/.exec(html)?.[1]
	const swap = /<script nonce="([^"]+)">\{const l=document\.createElement\(/.exec(html)?.[1]
	expect([critical, swap]).toEqual([header, header])
	expect(header).toMatch(/^[\da-f]{32}$/)
})

// `broadcast: false` leaves no BroadcastChannel in the client bundle.
it("broadcast off", () => {
	expect(clientCode(options)).not.toContain("BroadcastChannel")
	expect(clientCode(defaults)).toContain("BroadcastChannel")
})

function fonts(app: App | undefined): string[] {
	return clientFiles(app).filter((path) => path.endsWith(".woff2"))
}

// `fonts` emits the imported registry family's files from `dir`, byte for byte, at their registry url. Absent, none.
it("fonts", () => {
	const source = readdirSync(join(FONTS, "inter")).sort()
	expect(fonts(options)).toEqual(source.map((file) => `fonts/inter/${file}`))
	for (const file of source) {
		expect(clientFile(options, `fonts/inter/${file}`).equals(readFileSync(join(FONTS, "inter", file)))).toBe(true)
	}
	expect(fonts(defaults)).toEqual([])
})

// The most pages prerender rendered at once, from the preloaders' start and end lines.
function mostAtOnce(app: App | undefined): number {
	const lines = readFileSync(join(built(app).root, "prerender.log"), "utf8")
		.trim()
		.split("\n")
	const events = lines.map((line) => line.split(" ")).sort((left, right) => Number(left[2]) - Number(right[2]))
	let open = 0
	let most = 0
	for (const [word] of events) {
		open += word === "start" ? 1 : -1
		most = Math.max(most, open)
	}
	return most
}

function seeds(app: App | undefined): string[] {
	return clientFiles(app).filter((path) => path.includes("/_flare-static/"))
}

// Every ssg page is a seed in the client output, but an excluded one; `env` reaches each render; `concurrency` pages
// render at once, one by default.
it("prerender", () => {
	expect(seeds(options)).toHaveLength(3)
	expect(seeds(defaults)).toHaveLength(4)
	const flavors = (app: App | undefined) =>
		seeds(app).map((path) => {
			const seed: { data: { html: string } } = JSON.parse(clientFile(app, path).toString())
			const state = seed.data.html.includes("self.flare=") ? stateIn(seed.data.html) : []
			return Reflect.get(Object(state.at(-1)?.["preloader"]), "flavor")
		})
	expect(flavors(options)).toEqual(["built", "built", "built"])
	expect(flavors(defaults).toSorted()).toEqual(["undefined", "undefined", "undefined", undefined])
	expect(mostAtOnce(options)).toBe(2)
	expect(mostAtOnce(defaults)).toBe(1)
})

const MINIMAL: Record<string, string> = {
	"src/routes/_root_/root.root-layout.tsx": ROOT_LAYOUT,
	"src/routes/_root_/static/static.page.tsx": page("_root_/static", ".cache({ ssg: true })"),
}

// What only the app's files decide fails the build and names the cause: an ssg route with prerender off, a font file
// `dir` lacks, a sitemap with no `site`. Three builds run one after another: 1.1 s alone, 3.8 s under the full unit
// gate's parallel builds and engines, and once past the unit default of 5 s; the integration project's 60 s covers it.
it("build failures", async () => {
	const off = failedBuild(await viteBuild(apps.make({ ...MINIMAL, "vite.config.mjs": config("{}") })))
	expect(off).toContain("_root_/static renders at build, and flare({ prerender }) is off")
	const fontsConfig = config('{ prerender: true, fonts: { dir: "assets/fonts" } }')
	const fonts = apps.make({ ...MINIMAL, ...DEFAULT_ENTRIES, "src/app.css": "", "vite.config.mjs": fontsConfig })
	cpSync(FONTS, join(fonts, "assets/fonts"), { recursive: true })
	rmSync(join(fonts, "assets/fonts/inter/latin.woff2"))
	expect(failedBuild(await viteBuild(fonts))).toContain("latin.woff2")
	const live = { ...MINIMAL, "src/routes/_root_/static/static.page.tsx": page("_root_/static") }
	const siteless = apps.make({ ...live, "vite.config.mjs": config("{ prerender: { sitemap: {} } }") })
	expect(failedBuild(await viteBuild(siteless))).toContain("prerender.sitemap reads createServer({ site })")
	expect(existsSync(join(siteless, "dist", "client", "sitemap.xml"))).toBe(false)
})

// Vite resolving a config with flare() and these options, in a real app root.
function resolve(options: FlareOptions, server: { host?: string | boolean } = {}): Promise<unknown> {
	const root = apps.make({})
	return resolveConfig({ root, configFile: false, logLevel: "silent", plugins: [flare(options)], server }, "serve")
}

// flare() made with these options, which may not type-check.
function plugin(options: unknown): () => unknown {
	return () => flare(options as FlareOptions)
}

// Each rejected option throws when the plugin is made or the config resolves, and an allowed one resolves.
it("options checked", async () => {
	expect(plugin({ assetsBase: "/static/" })).toThrow("/static/")
	expect(plugin({ assetsBase: "/static?v=1" })).toThrow("/static?v=1")
	expect(plugin({ css: { reset: true, purge: true } })).toThrow("purge")
	expect(plugin({ broadcast: "yes" })).toThrow("broadcast")
	expect(plugin({ fonts: { dir: "" } })).toThrow("fonts.dir")
	expect(plugin({ image: { widths: [5000] } })).toThrow("image.widths")
	expect(plugin({ image: { quality: 75.5 } })).toThrow("image.quality")
	for (const key of ["alias", "codegen", "dev", "port", "site", "solid", "sx", "logLevel"]) {
		expect(plugin({ [key]: true })).toThrow(key)
	}
	await expect(resolve({ entry: { client: "/abs/client.tsx" } })).rejects.toThrow(/entry\.client/)
	await expect(resolve({ entry: { server: "src/missing.ts" } })).rejects.toThrow(/entry\.server src\/missing\.ts/)
	for (const host of [true, "0.0.0.0", "::", "", "0", "::0", "[::]"]) {
		await expect(resolve({}, { host })).rejects.toThrow(`server.host ${JSON.stringify(host)} binds every interface`)
	}
	const later = { name: "later", config: () => ({ server: { host: true } }) }
	const root = apps.make({})
	const config = { root, configFile: false as const, logLevel: "silent" as const, plugins: [flare({}), later] }
	await expect(resolveConfig(config, "serve")).rejects.toThrow("server.host true binds every interface")
	for (const host of ["localhost", "127.0.0.1", "::1"]) await expect(resolve({}, { host })).resolves.toBeDefined()
})
