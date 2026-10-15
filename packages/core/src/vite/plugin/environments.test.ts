import { spawnSync } from "node:child_process"
import {
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createBuilder, type InlineConfig, type Rollup, type ViteBuilder } from "vite"
import { afterEach, expect, it, vi } from "vitest"
import { assetUrl, clientUrl, environmentBuild, environmentOrder, seedBase } from "./environments.ts"
import { prerenderApp } from "../prerender/index.ts"
import { flare } from "./flare.ts"

// Prerender loads the built server, which these builds do not write. Its rows are vite/prerender/run.test.ts.
vi.mock("../prerender/index.ts", () => ({ prerenderApp: vi.fn<typeof prerenderApp>(async () => undefined) }))
import type { FlareOptions } from "./options.ts"

const SHEET = fileURLToPath(new URL("../../shared/css/sheet.ts", import.meta.url))

// Inside the repo's node_modules, so a config file's import of the plugin resolves as an app's would.
const FIXTURES = fileURLToPath(new URL("../../../../../node_modules/.flare-fixtures/", import.meta.url))

// A client entry with a stylesheet, a CSS asset, and a lazy chunk, and a server entry that keeps the sheet module.
const APP = {
	"client.tsx": 'import "./app.css";\nvoid import("./lazy.ts");\n',
	"lazy.ts": "export const lazy = 1;\n",
	"app.css": ".a{background:url(./dot.svg)}\n",
	"dot.svg": '<svg xmlns="http://www.w3.org/2000/svg"></svg>\n',
	"server.ts": `export { builtHref, builtSheet } from ${JSON.stringify(SHEET)};\n`,
}

const roots: string[] = []

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function project(files: Record<string, string> = APP): string {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "flare-env-")))
	roots.push(root)
	mkdirSync(join(root, "src"))
	for (const [name, text] of Object.entries(files)) {
		mkdirSync(dirname(join(root, "src", name)), { recursive: true })
		writeFileSync(join(root, "src", name), text)
	}
	return root
}

// A builder over flare() alone, writing nothing. Assets are never inlined, so a CSS `url()` is a built file.
function builder(root: string, options: FlareOptions = {}, config: InlineConfig = {}): Promise<ViteBuilder> {
	return createBuilder({
		root,
		configFile: false,
		logLevel: "silent",
		plugins: flare(options),
		...config,
		build: { write: false, assetsInlineLimit: 0, ...config.build },
	})
}

function outputs(result: unknown): Rollup.OutputBundle[keyof Rollup.OutputBundle][] {
	const list = Array.isArray(result) ? result : [result]
	return list.flatMap((item: unknown) =>
		typeof item === "object" && item !== null && "output" in item && Array.isArray(item.output) ? item.output : [],
	)
}

function text(files: ReturnType<typeof outputs>, name: string): string {
	const found = files.find((file) => file.fileName === name || file.fileName.endsWith(name))
	if (found === undefined) throw new Error(`no ${name}`)
	return found.type === "chunk" ? found.code : String(found.source)
}

it("defaults", async () => {
	const app = await builder(project())
	expect(app.environments.client?.config.build).toMatchObject({
		outDir: "dist/client",
		manifest: true,
		cssCodeSplit: false,
		assetsDir: "assets",
	})
	const ssr = app.environments.ssr?.config.build
	expect(ssr).toMatchObject({ outDir: "dist/server", minify: "oxc", sourcemap: true })
	expect(ssr?.rollupOptions.output).toMatchObject({ entryFileNames: "server.js" })
	// A caller's outDir replaces `dist`.
	const out = await builder(project(), {}, { build: { outDir: "out" } })
	expect(out.environments.client?.config.build.outDir).toBe("out/client")
	expect(out.environments.ssr?.config.build.outDir).toBe("out/server")
	const pure = environmentBuild()
	expect(pure.client).toEqual({ outDir: "dist/client", manifest: true, cssCodeSplit: false, assetsDir: "assets" })
	expect(`${pure.ssr.outDir}/${pure.ssr.input}`).toBe("dist/server/server.js")
})

it("assets dir", async () => {
	expect(environmentBuild({ assetsBase: "/" }).client.assetsDir).toBe("assets")
	expect(environmentBuild({ assetsBase: "/cdn" }).client.assetsDir).toBe("cdn")
	expect(() => environmentBuild({ assetsBase: "/", assetsDir: "static" })).toThrow("assets")
	await expect(builder(project(), { assetsBase: "/" }, { build: { assetsDir: "static" } })).rejects.toThrow("assets")
})

// The environments buildApp builds, in order, each once.
async function order(root: string): Promise<string[]> {
	const app = await builder(root)
	const built: string[] = []
	vi.spyOn(app, "build").mockImplementation(async (environment) => {
		built.push(environment.name)
		environment.isBuilt = true
		return { output: [] } as never
	})
	await app.buildApp()
	return built
}

// After every environment, prerender runs with the client output and the built server.
it("after build", async () => {
	const root = project()
	vi.mocked(prerenderApp).mockClear()
	await order(root)
	expect(vi.mocked(prerenderApp)).toHaveBeenCalledWith({
		root,
		clientDir: join(root, "dist/client"),
		serverFile: join(root, "dist/server/server.js"),
		assetsBase: "/assets",
		config: false,
	})
})

// The client builds first, then ssr. A Node build for prerender follows only when the Cloudflare plugin owns ssr and
// prerender is on (B109). A Wrangler config alone adds no environment.
it("order", async () => {
	expect(environmentOrder({ cloudflare: false, prerender: true })).toEqual(["client", "ssr"])
	expect(environmentOrder({ cloudflare: true, prerender: false })).toEqual(["client", "ssr"])
	expect(environmentOrder({ cloudflare: true, prerender: true })).toEqual(["client", "ssr", "flare_prerender"])
	const root = project()
	writeFileSync(join(root, "wrangler.jsonc"), '{ "name": "app", "assets": { "binding": "ASSETS" } }\n')
	expect(await order(root)).toEqual(["client", "ssr"])
	expect((await builder(root)).environments["worker"]).toBeUndefined()
}, 60_000)

// `public/` ships once, with the client: the server build leaves it out (BUGS.md B11).
it("public once", async () => {
	const root = project({
		"client.tsx": "",
		"server.ts": 'export const server = { fetch: () => new Response("ok") };\n',
	})
	mkdirSync(join(root, "public"))
	writeFileSync(join(root, "public", "x.txt"), "x\n")
	const app = await builder(root, {}, { build: { write: true } })
	expect(app.environments.client?.config.build.copyPublicDir).toBe(true)
	expect(app.environments.ssr?.config.build.copyPublicDir).toBe(false)
	await app.buildApp()
	expect(existsSync(join(root, "dist/client/x.txt"))).toBe(true)
	expect(existsSync(join(root, "dist/server/x.txt"))).toBe(false)
}, 60_000)

// A root reached through a symlink builds as its real path does: flare takes the root's real path, the form Vite gives
// module ids in, so the manifest knows the client entry and prerender reads the real output (BUGS.md B51).
it("symlinked root", async () => {
	const real = project()
	const link = `${real}-link`
	symlinkSync(real, link)
	roots.push(link)
	const app = await builder(link, {}, { build: { write: true } })
	expect(app.config.root).toBe(real)
	vi.mocked(prerenderApp).mockClear()
	await app.buildApp()
	expect(existsSync(join(real, "dist/server/server.js"))).toBe(true)
	expect(vi.mocked(prerenderApp)).toHaveBeenCalledWith(expect.objectContaining({ root: real }))
}, 60_000)

it("client url", () => {
	expect(clientUrl({ entry: "src/client.tsx" })).toBe("/src/client.tsx")
	const manifest = { "src/client.tsx": { file: "assets/client-1a2b3c.js" } }
	expect(clientUrl({ entry: "src/client.tsx", manifest })).toBe("/assets/client-1a2b3c.js")
	expect(clientUrl({ entry: "src/client.tsx", manifest, urls: { base: "/app/", assetsBase: "/assets" } })).toBe(
		"/app/assets/client-1a2b3c.js",
	)
	expect(() => clientUrl({ entry: "src/main.tsx", manifest })).toThrow(/src\/main\.tsx/)
})

// One resolver gives every URL the server writes. A chunk URL is relative to the entry chunk, so it lands under the
// same prefix. The seed directory is a path inside the client output, which a file read or the Workers assets
// binding serves, and its public URL agrees too.
it("urls agree", async () => {
	const cases: Array<{ options: FlareOptions; config: InlineConfig; prefix: string }> = [
		{ options: {}, config: { base: "/app/" }, prefix: "/app/assets/" },
		{ options: { assetsBase: "/cdn" }, config: {}, prefix: "/cdn/" },
		{ options: { assetsBase: "/" }, config: {}, prefix: "/" },
	]
	for (const { options, config, prefix } of cases) {
		const app = await builder(project(), options, config)
		const urls = { base: app.config.base, assetsBase: options.assetsBase ?? "/assets" }
		const client = outputs(await app.build(app.environments.client ?? never()))
		const manifest: Record<string, { file: string }> = JSON.parse(text(client, ".vite/manifest.json"))
		const entry = clientUrl({ entry: "src/client.tsx", manifest, urls })
		expect(entry.startsWith(prefix)).toBe(true)
		expect(entry.slice(prefix.length)).not.toContain("/")
		const lazy = manifest["src/lazy.ts"]?.file ?? never()
		expect(text(client, basename(entry))).toContain(`./${basename(lazy)}`)
		expect(new URL(`./${basename(lazy)}`, `http://host${entry}`).pathname).toBe(assetUrl(lazy, urls))
		const server = text(outputs(await app.build(app.environments.ssr ?? never())), "server.js")
		expect(server).toMatch(new RegExp(`["'\`]${prefix}style-[\\w-]+\\.css["'\`]`))
		expect(server).toMatch(new RegExp(`url\\(${prefix}dot-[\\w-]+\\.svg\\)`))
		expect(assetUrl(seedBase(urls.assetsBase).slice(1), urls).startsWith(prefix)).toBe(true)
	}
	expect(seedBase("/assets")).toBe("/assets/_flare-static")
	expect(seedBase("/cdn")).toBe("/cdn/_flare-static")
	expect(seedBase("/")).toBe("/assets/_flare-static")
}, 60_000)

// The server reads the client build's stylesheet, so a server build that runs first fails.
it("css order", async () => {
	const app = await builder(project())
	await expect(app.build(app.environments.ssr ?? never())).rejects.toThrow(/client build must run before/)
}, 30_000)

// The server holds the client's one stylesheet as text and its URL. No client chunk holds the CSS: the browser loads
// the file.
it("css server only", async () => {
	const app = await builder(project())
	const client = outputs(await app.build(app.environments.client ?? never()))
	const sheet = client.find((file) => file.fileName.endsWith(".css")) ?? never()
	const css = sheet.type === "asset" ? String(sheet.source) : never()
	const rule = css.slice(0, css.indexOf("}") + 1)
	expect(rule).toMatch(/^\.a\{background:url\(/)
	const server = text(outputs(await app.build(app.environments.ssr ?? never())), "server.js")
	expect(server).toContain(rule)
	expect(server).toContain(`/${sheet.fileName}`)
	const scripts = client.flatMap((file) => (file.type === "chunk" ? [file.code] : []))
	expect(scripts.length).toBeGreaterThan(0)
	for (const code of scripts) expect(code).not.toContain(rule)
}, 60_000)

// The client build turns each source path of the generated `chunks` map into the hashed file the lazy import loads,
// as a URL relative to the entry chunk. Serve keeps the source paths, which are the dev URLs.
it("chunk urls", async () => {
	const root = project({
		"client.tsx":
			'import { chunks, layouts, routeTree } from "./_gen/routes.gen.ts";\nconsole.log(chunks, layouts, routeTree);\n',
		"server.ts": "export const server = {};\n",
		"routes/_root_/root.root-layout.tsx": 'export const route = "root";\n',
		"routes/_root_/a/a.page.tsx": 'export const route = "a";\n',
	})
	const app = await builder(root)
	const client = outputs(await app.build(app.environments.client ?? never()))
	const manifest: Record<string, { file: string }> = JSON.parse(text(client, ".vite/manifest.json"))
	const entry = text(client, basename(manifest["src/client.tsx"]?.file ?? never()))
	for (const source of ["src/routes/_root_/a/a.page.tsx", "src/routes/_root_/root.root-layout.tsx"]) {
		const file = basename(manifest[source]?.file ?? never())
		expect(entry).toMatch(new RegExp(`new URL\\([\`'"]${file.replace(".", "\\.")}[\`'"],\\s*import\\.meta\\.url\\)`))
	}
	expect(entry).not.toContain("/src/routes/")
	// Codegen wrote the map at the start of the build. `vite dev` keeps its source paths, which are the dev URLs.
	const generated = readFileSync(join(root, "src/_gen/routes.gen.ts"), "utf8")
	expect(generated).toContain('"_root_/a": "/src/routes/_root_/a/a.page.tsx"')
	const plugin = flare().find((item) => item.name === "flare:chunks")
	const transform = plugin?.transform
	if (typeof transform !== "function") throw new Error("transform")
	const serve = { environment: { name: "client", config: { command: "serve", root } } }
	expect(Reflect.apply(transform, serve, [generated, join(root, "src/_gen/routes.gen.ts")])).toBeNull()
}, 60_000)

const VITE = fileURLToPath(new URL("../../../../../node_modules/vite/bin/vite.js", import.meta.url))

// `vite build` from a config file, as the CLI runs it, in a child process. One config and one plugin set serve every
// environment, so what the client build captures reaches the server build. Vite would otherwise load the config
// again per environment, and its flare() call would make new plugins.
it("config file", () => {
	mkdirSync(FIXTURES, { recursive: true })
	const root = mkdtempSync(join(FIXTURES, "config-"))
	roots.push(root)
	mkdirSync(join(root, "src"))
	for (const [name, source] of Object.entries(APP)) writeFileSync(join(root, "src", name), source)
	// The server entry is a real server, as prerender loads it after the server build.
	writeFileSync(
		join(root, "src/server.ts"),
		'import { createServer } from "@lovrozagar/flare/server";\nimport { createRouter } from "@lovrozagar/flare";\nexport const server = createServer({ router: createRouter({ layouts: {}, routeTree: [] }) });\n',
	)
	writeFileSync(join(root, "src/app.css"), ".a{background:url(./dot.svg)}\n")
	writeFileSync(join(root, "src/client.tsx"), 'import "./app.css";\n')
	const config =
		'import { flare } from "@lovrozagar/flare/vite";\nexport default { logLevel: "silent", build: { assetsInlineLimit: 0 }, plugins: [flare()] };\n'
	writeFileSync(join(root, "vite.config.mjs"), config)
	// A deploy builds with NODE_ENV production. The test runner's `test` would select Solid's development server build.
	const env = { ...process.env, NODE_ENV: "production" }
	const run = spawnSync(process.execPath, [VITE, "build"], { cwd: root, encoding: "utf8", env })
	expect(run.stderr).toBe("")
	expect(run.status).toBe(0)
	const server = readFileSync(join(root, "dist/server/server.js"), "utf8")
	expect(server).toMatch(/\.a\{background:url\(\/assets\/dot-[\w-]+\.svg\)\}/)
}, 60_000)

// An app whose client starts a Web Worker from `work.ts`.
function workerApp(worker: string): Record<string, string> {
	return {
		"client.tsx": 'import Work from "./work.ts?worker";\nnew Work();\n',
		"server.ts": "export const server = {};\n",
		"work.ts": worker,
	}
}

// A Vite `?worker` bundle is a client graph: the boundary rewrites it and the tripwire scans it, so a Web Worker that
// reaches the package's server code fails the build and names the module, and a clean one builds.
it("web worker", async () => {
	const SERVER = fileURLToPath(new URL("../../server/context/ctx.ts", import.meta.url))
	const leaking = await builder(
		project(workerApp(`import { serverCtx } from ${JSON.stringify(SERVER)};\npostMessage(String(serverCtx));\n`)),
	)
	await expect(leaking.build(leaking.environments.client ?? never())).rejects.toThrow(
		/server\/context\/ctx\.ts is server code and cannot be in the client graph \(B45\)/,
	)
	// Under the repo's node_modules, so the worker's import of the package resolves.
	mkdirSync(FIXTURES, { recursive: true })
	const root = mkdtempSync(join(FIXTURES, "worker-"))
	roots.push(root)
	const env = 'import { createServerOnlyFn } from "@lovrozagar/flare";\n'
	const worker = `${env}export const read = createServerOnlyFn(() => "SECRET_IN_WORKER");\npostMessage(1);\n`
	for (const [name, source] of Object.entries(workerApp(worker))) {
		mkdirSync(join(root, "src"), { recursive: true })
		writeFileSync(join(root, "src", name), source)
	}
	const clean = await builder(root)
	const client = outputs(await clean.build(clean.environments.client ?? never()))
	const code = client.flatMap((file) =>
		file.type === "chunk" ? [file.code] : file.fileName.endsWith(".js") ? [String(file.source)] : [],
	)
	expect(code.join("\n")).toContain("postMessage")
	expect(code.join("\n")).not.toContain("SECRET_IN_WORKER")
}, 60_000)

function never(): never {
	throw new Error("missing")
}
