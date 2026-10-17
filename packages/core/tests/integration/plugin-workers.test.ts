import { existsSync, readdirSync, readFileSync } from "node:fs"
import * as nodeModule from "node:module"
import { join, resolve } from "node:path"
import { gzipSync } from "node:zlib"
import { Miniflare } from "miniflare"
import { unstable_getMiniflareWorkerOptions } from "wrangler"
import { afterAll, expect, it } from "vitest"
import { fixtureApps, page, rootLayout, viteBuild } from "./vite-app.ts"

// dx/plugin.md's Cloudflare Workers composition through a real app (B96, B109): the app adds Cloudflare's plugin
// beside flare() and points its Wrangler config at Flare's worker entry, `vite build` builds the worker and writes its
// deploy config, and Miniflare runs what `wrangler deploy` would ship. The plugin needs node:module's registerHooks,
// which the Bun runtime lacks, so the Bun run skips these cases (as golden.test's `workers`).

const apps = fixtureApps()

afterAll(() => apps.removeAll())

const noHooks = typeof Reflect.get(nodeModule, "registerHooks") !== "function"

function config(options: string): string {
	return [
		'import { cloudflare } from "@cloudflare/vite-plugin";',
		'import { flare } from "@lovrozagar/flare/vite";',
		`export default { logLevel: "error", plugins: [cloudflare({ viteEnvironment: { name: "ssr" }, inspectorPort: 0, persistState: false }), flare(${options})] };`,
		"",
	].join("\n")
}

function wrangler(main: string): string {
	return JSON.stringify({
		name: "app",
		main,
		compatibility_date: "2026-07-01",
		compatibility_flags: ["nodejs_compat"],
		assets: { binding: "ASSETS", directory: "dist/client" },
	})
}

const ROUTES = {
	"src/routes/_root_/root.root-layout.tsx": rootLayout("_root_"),
	"src/routes/_root_/home.page.tsx": page("_root_/"),
	// An imported asset over Vite's 4 KiB inline limit, so it is a file the worker renders a URL for (BUGS.md 132).
	"src/routes/_root_/logo/logo.page.tsx":
		'import { createPage } from "@lovrozagar/flare";\nimport logo from "./logo.svg";\nexport const route = createPage("_root_/logo").render(() => <img id="logo" src={logo} alt="" />);\n',
	"src/routes/_root_/logo/logo.svg": `<svg xmlns="http://www.w3.org/2000/svg"><!-- ${"x".repeat(5000)} --></svg>`,
	// The same asset on a page prerender renders, in its own Node build of the server (B109, BUGS.md 132).
	"src/routes/_root_/seeded/seeded.page.tsx":
		'import { createPage } from "@lovrozagar/flare";\nimport logo from "../logo/logo.svg";\nexport const route = createPage("_root_/seeded").cache({ ssg: true }).render(() => <img id="seeded" src={logo} alt="" />);\n',
	// Prerender reads `site`.
	"src/server.ts":
		'import { createServer } from "@lovrozagar/flare/server";\nimport { router } from "./router.ts";\nexport const server = createServer({ router, site: "https://flare.test" });\n',
}

// Every module of the unbundled Workers output, its main first, as `wrangler deploy` uploads them.
function modulesOf(dir: string, main: string): { type: "ESModule"; path: string }[] {
	const files = readdirSync(dir, { recursive: true, encoding: "utf8" })
		.map((file) => join(dir, file))
		.filter((path) => /\.m?js$/.test(path) && path !== main)
	return [main, ...files.toSorted()].map((path) => ({ type: "ESModule", path }))
}

// A custom `assetsBase` with the Workers composition: the build writes the worker, its deploy config, and the pointer
// `wrangler deploy` reads; the client output's `_headers` makes `/static/*` immutable (B130); and the worker answers
// the page while the assets binding serves a hashed file, and the asset the worker renders a URL for, with that header.
// Prerender's own Node build renders the same asset URL into its seed.
it.skipIf(noHooks)(
	"workers build",
	async () => {
		const root = apps.make({
			...ROUTES,
			"vite.config.mjs": config('{ assetsBase: "/static", prerender: true }'),
			"wrangler.json": wrangler("@lovrozagar/flare/worker"),
		})
		const built = await viteBuild(root)
		if (built.status !== 0) throw new Error(built.output)
		const server = join(root, "dist", "server")
		expect(existsSync(join(server, "wrangler.json"))).toBe(true)
		const pointer: { configPath: string } = JSON.parse(readFileSync(join(root, ".wrangler/deploy/config.json"), "utf8"))
		expect(resolve(root, ".wrangler/deploy", pointer.configPath)).toBe(join(server, "wrangler.json"))
		const headers = readFileSync(join(root, "dist", "client", "_headers"), "utf8")
		expect(headers).toBe("/static/*\n  Cache-Control: public, max-age=31536000, immutable\n")
		const entry = readdirSync(join(root, "dist", "client", "static")).find((file) => /^client-[\w-]+\.js$/.test(file))
		const seeds = join(root, "dist", "client", "static", "_flare-static")
		const seed = readdirSync(seeds, { recursive: true, encoding: "utf8" }).find((file) => file.endsWith(".json"))
		if (seed === undefined) throw new Error("prerender wrote no seed")
		const seeded: { data: { html: string } } = JSON.parse(readFileSync(join(seeds, seed), "utf8"))
		const seededLogo = /<img [^>]*src="([^"]+)"/.exec(seeded.data.html)?.[1]
		expect(seededLogo).toMatch(/^\/static\/logo-[\w-]+\.svg$/)
		const deploy = unstable_getMiniflareWorkerOptions(join(server, "wrangler.json"))
		if (deploy.main === undefined) throw new Error("the deploy config names no main")
		const modules = modulesOf(server, resolve(server, deploy.main))
		// What `wrangler deploy` uploads, gzipped as Cloudflare counts it, is under the Workers free plan's 3 MiB script
		// limit, so a deploy is never refused for size (plan 21 5.6).
		const uploaded = modules.reduce((sum, module) => sum + gzipSync(readFileSync(module.path)).length, 0)
		expect(uploaded).toBeLessThanOrEqual(3 * 1024 * 1024)
		const runtime = new Miniflare({
			...deploy.workerOptions,
			modules,
			modulesRoot: server,
		})
		try {
			const home = await runtime.dispatchFetch("http://localhost/")
			const html = await home.text()
			expect(home.status).toBe(200)
			expect(html).toMatch(/<p [^>]*id="page">/)
			expect(html).toContain(`import("/static/${entry}")`)
			const asset = await runtime.dispatchFetch(`http://localhost/static/${entry}`)
			expect(asset.status).toBe(200)
			expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable")
			await asset.body?.cancel()
			const logo = /<img [^>]*src="([^"]+)"/.exec(
				await (await runtime.dispatchFetch("http://localhost/logo")).text(),
			)?.[1]
			expect(logo).toBe(seededLogo)
			const svg = await runtime.dispatchFetch(`http://localhost${logo}`)
			expect(svg.status).toBe(200)
			expect(svg.headers.get("cache-control")).toBe("public, max-age=31536000, immutable")
			await svg.body?.cancel()
		} finally {
			await runtime.dispose()
		}
	},
	180_000,
)

// The composition is checked when the config resolves: a Wrangler `main` other than Flare's worker entry fails the
// build with the fix.
it.skipIf(noHooks)(
	"workers composition checked",
	async () => {
		const root = apps.make({ ...ROUTES, "vite.config.mjs": config("{}"), "wrangler.json": wrangler("src/server.ts") })
		const built = await viteBuild(root)
		expect(built.status).not.toBe(0)
		expect(built.output).toContain("@lovrozagar/flare/worker")
	},
	180_000,
)
