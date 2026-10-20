import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { createServer } from "vite"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import solid from "@solidjs/vite-plugin"
import { expect, it, vi } from "vitest"
import { fnId } from "../route-meta/index.ts"
import { ID_PLACEHOLDER } from "./build-id.ts"
import { flare } from "./flare.ts"
import type { FlareOptions } from "./options.ts"

type OwnOptions = FlareOptions

vi.mock("@solidjs/vite-plugin", () => ({
	default: vi.fn<() => Array<{ name: string }>>(() => [{ name: "solid" }]),
}))

function project(): string {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "flare-plugin-")))
	mkdirSync(join(root, "src"))
	writeFileSync(join(root, "src/client.tsx"), "")
	writeFileSync(join(root, "src/server.ts"), "")
	return root
}

function apply(config: { root?: string }, options?: OwnOptions): void {
	const plugin = flare(options).find((item) => item.name === "flare")
	const hook = plugin?.config
	if (typeof hook !== "function") throw new Error("config")
	hook.call(null as never, config as never, { command: "serve", mode: "development" } as never)
}

it("entry", () => {
	const root = project()
	try {
		expect(() => apply({ root })).not.toThrow()
		expect(() => apply({})).toThrow("entry.client src/client.tsx")
		rmSync(join(root, "src/client.tsx"))
		expect(() => apply({ root })).toThrow("entry.client src/client.tsx")
		writeFileSync(join(root, "src/client.tsx"), "")
		rmSync(join(root, "src/server.ts"))
		expect(() => apply({ root })).toThrow("entry.server src/server.ts")
		writeFileSync(join(root, "src/server.ts"), "")
		expect(() => apply({ root }, { entry: { client: "/tmp/client.tsx" } })).toThrow(/^entry\.client$/)
		expect(() => apply({ root }, { entry: { server: "/tmp/server.ts" } })).toThrow(/^entry\.server$/)
		expect(() => apply({ root }, { entry: { client: "src/missing.tsx" } })).toThrow("entry.client src/missing.tsx")
		expect(() => apply({ root }, { entry: { server: "src/missing.ts" } })).toThrow("entry.server src/missing.ts")
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

// The plugin's configResolved, given a resolved config whose dev server binds this host.
function resolveHost(host: string | boolean | undefined): void {
	const hook = flare().find((item) => item.name === "flare")?.configResolved
	if (typeof hook !== "function") throw new Error("configResolved")
	const config = { base: "/", root: tmpdir(), plugins: [], environments: {}, server: { host } }
	hook.call(null as never, config as never)
}

// Every spelling of a bind on all interfaces throws once the config is resolved, so a later plugin's host counts too;
// a loopback host does not (BUGS.md 386).
it("host", () => {
	for (const host of [true, "", " ", "0", "0.0.0.0", "0x0", "::", "::0", "[::]", "0:0:0:0:0:0:0:0", "::ffff:0.0.0.0"]) {
		expect(() => resolveHost(host)).toThrow(`server.host ${JSON.stringify(host)} binds every interface`)
	}
	for (const host of [undefined, false, "localhost", "127.0.0.1", "::1", "[::1]", "fe80::1%lo0"]) {
		expect(() => resolveHost(host)).not.toThrow()
	}
})

it("solid options", () => {
	flare()
	expect(vi.mocked(solid)).toHaveBeenCalledWith({ ssr: true, extensions: [".tsx", ".jsx"] })
})

const BUILD_INFO = fileURLToPath(new URL("../../server/lifecycle/build-info.ts", import.meta.url))

function flarePlugin(options?: OwnOptions) {
	const plugin = flare(options).find((item) => item.name === "flare")
	if (plugin === undefined) throw new Error("plugin")
	return plugin
}

// The plugin's config hook for this root, then its load hook as the named environment would call it.
// The core plugin's server hook, which runs first among the plugins' (`order: "pre"`, B95 (b)).
function serverHook(plugin: ReturnType<typeof flarePlugin>): (...args: unknown[]) => unknown {
	const hook: unknown = plugin.configureServer
	const handler: unknown = typeof hook === "object" && hook !== null ? Reflect.get(hook, "handler") : hook
	if (typeof handler !== "function") throw new Error("configureServer")
	return (...args) => Reflect.apply(handler, null, args)
}

function loader(plugin: ReturnType<typeof flarePlugin>, root: string) {
	const config = plugin.config
	if (typeof config !== "function") throw new Error("config")
	const returned = config.call(null as never, { root } as never, { command: "build", mode: "production" } as never)
	const load = plugin.load
	if (typeof load !== "function") throw new Error("load")
	return {
		returned,
		load: (name: string, command: "serve" | "build", id = BUILD_INFO): unknown =>
			Reflect.apply(load, { environment: { name, config: { command, root } } }, [id]),
		// The dev server's start: it computes devHead from transformIndexHtml (B95 (b)).
		start: (head: string): void => {
			const server = {
				config: { root, server: { middlewareMode: true } },
				watcher: { on: () => undefined },
				transformIndexHtml: async () => `<html><head>${head}</head><body></body></html>`,
				environments: {},
			}
			serverHook(plugin)(server)
		},
	}
}

// The server environments load build-info.ts as the dev entry in serve and as the client build's id and hashed entry in
// a build, after the client wrote its manifest. No define is set.
it("client entry define", async () => {
	const root = project()
	try {
		const { returned, load, start } = loader(flarePlugin(), root)
		start("<meta name=x>")
		expect(returned).toMatchObject({
			appType: "custom",
			resolve: { dedupe: ["solid-js", "@solidjs/web"] },
			// A build also bundles the i18n peers, so a built server holds them (plan 21 5.5).
			ssr: {
				noExternal: [
					"solid-js",
					"@solidjs/web",
					"@lovrozagar/flare",
					"@tanstack/solid-query",
					"@formatjs/intl-localematcher",
					"isbot",
					"negotiator",
				],
			},
			optimizeDeps: {
				exclude: ["@lovrozagar/flare"],
				include: ["@lovrozagar/flare > seroval", "@lovrozagar/flare > seroval-plugins/web"],
			},
		})
		expect(returned).not.toHaveProperty("define")
		expect(flarePlugin().configEnvironment).toBeUndefined()
		const head = '\nexport const devHead = "<meta name=x>";\nexport const preloads = {"entry":[],"routes":{}};\n'
		const dev = `export const buildId = "dev";\nexport const clientEntry = "/src/client.tsx";${head}`
		expect(await load("ssr", "serve")).toBe(dev)
		expect(await load("flare_prerender", "serve")).toBe(dev)
		expect(load("client", "serve")).toBeNull()
		expect(load("ssr", "serve", join(root, "src/other.ts"))).toBeNull()
		writeFileSync(join(root, "src/entry.tsx"), "")
		const other = loader(flarePlugin({ entry: { client: "src/entry.tsx" } }), root)
		other.start("<meta name=x>")
		expect(await other.load("ssr", "serve")).toBe(
			`export const buildId = "dev";\nexport const clientEntry = "/src/entry.tsx";${head}`,
		)
		const manifest = join(root, "dist/client/.vite/manifest.json")
		expect(() => load("ssr", "build")).toThrow(manifest)
		mkdirSync(join(root, "dist/client/.vite"), { recursive: true })
		writeFileSync(manifest, JSON.stringify({ "src/client.tsx": { file: "assets/client-a1.js" } }))
		expect(load("ssr", "build")).toBe(
			`export const buildId = "${ID_PLACEHOLDER}";\nexport const clientEntry = "/assets/client-a1.js";\nexport const devHead = "";\n` +
				`export const preloads = {"entry":["/assets/client-a1.js"],"routes":{}};\n`,
		)
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

// Dev leaves the i18n peers to Node: negotiator is CommonJS, which Vite's dev runner does not transform.
it("dev bundles", () => {
	const root = project()
	try {
		const config = flarePlugin().config
		if (typeof config !== "function") throw new Error("config")
		const returned = config.call(null as never, { root } as never, { command: "serve", mode: "development" } as never)
		expect(returned).toMatchObject({
			ssr: { noExternal: ["solid-js", "@solidjs/web", "@lovrozagar/flare", "@tanstack/solid-query"] },
		})
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
})

// The peer guard runs first, so its resolveId sees the package's import of an optional peer before Vite's resolver
// answers it with a stub (plan 21 5.5).
it("peer guard first", () => {
	expect(flare().map((plugin) => plugin.name)[0]).toBe("flare:peers")
})

it("dev server", () => {
	expect(flarePlugin().configureServer).toMatchObject({ order: "pre" })
	const hook = { call: (_self: unknown, server: unknown) => serverHook(flarePlugin())(server) }
	const used: unknown[] = []
	const server = (middlewareMode: boolean) => ({
		config: { root: "/app", server: { middlewareMode }, logger: { error: () => undefined } },
		watcher: { on: () => undefined },
		middlewares: { use: (handler: unknown) => void used.push(handler) },
		transformIndexHtml: async (_url: string, html: string) => html,
		ws: { send: () => undefined },
		environments: { ssr: { hot: { on: () => undefined } }, client: { hot: { on: () => undefined } } },
	})
	expect(hook.call(null as never, server(true) as never)).toBeUndefined()
	const post = hook.call(null as never, server(false) as never)
	expect(typeof post).toBe("function")
	// A plain stylesheet edit leaves the server's modules in place (BUGS.md 99).
	expect(flare().some((item) => item.name === "flare:css-update")).toBe(true)
})

// The map carries the original source, so only the code is checked.
function code(result: unknown): string {
	const text: unknown = typeof result === "object" && result !== null ? Reflect.get(result, "code") : undefined
	if (typeof text !== "string") throw new Error("the module was not transformed")
	return text
}

it("boundary transform", () => {
	const plugin = flare().find((item) => item.name === "flare:boundary")
	expect(plugin?.enforce).toBe("pre")
	const hook = plugin?.transform
	if (typeof hook !== "function") throw new Error("transform")
	const root = "/app"
	const run = (name: string, id: string, code: string): unknown =>
		Reflect.apply(hook, { environment: { name, config: { root } } }, [code, id])
	const source =
		'import { createServerOnlyFn } from "@lovrozagar/flare";\nexport const read = createServerOnlyFn(() => SECRET);\n'
	expect(code(run("client", "/app/src/lib/read.ts", source))).not.toContain("SECRET")
	expect(run("ssr", "/app/src/lib/read.ts", source)).toBeNull()
	expect(run("flare_prerender", "/app/src/lib/read.ts", source)).toBeNull()
	// The id hashes the root-relative path.
	const fn =
		'import { createServerFn } from "@lovrozagar/flare/server-fn";\nexport const echo = createServerFn().handler(h);\n'
	expect(code(run("ssr", "/app/src/fns/echo.ts", fn))).toContain(`__id: "${fnId("src/fns/echo.ts", "echo")}"`)
	// Vite's own queries leave the module the module. Any other asks for something else.
	expect(code(run("client", "/app/src/lib/read.ts?v=abc123", source))).not.toContain("SECRET")
	expect(code(run("client", "/app/src/lib/read.ts?import&t=1", source))).not.toContain("SECRET")
	for (const id of [
		"/app/src/lib/read.ts?raw",
		"/app/src/lib/read.ts?url",
		"/app/src/lib/read.ts?worker",
		"/app/src/lib/read.ts?inline",
		"\0virtual:x.ts",
		"/app/src/style.css",
		"/elsewhere/read.ts",
		"/app/node_modules/x/read.ts",
	]) {
		expect(run("client", id, source)).toBeNull()
	}
	expect(run("client", "/app/src/plain.ts", "export const a = 1;\n")).toBeNull()
})

// A server function outside src/ would answer 404 on every call, since codegen registers src/ alone: under the root it
// gets an id no server knows, outside it none. Dev and the build fail naming the file. A test run (mode "test") may
// define one in a test file; a dependency, Flare's own source, and a module with none pass (plan 21 8.7, BUGS.md 201).
it("server function home", () => {
	const hook = flare().find((item) => item.name === "flare:boundary")?.transform
	if (typeof hook !== "function") throw new Error("transform")
	const fn =
		'import { createServerFn } from "@lovrozagar/flare/server-fn";\nexport const echo = createServerFn().handler(h);\n'
	const run = (id: string, mode?: string, source = fn): unknown =>
		Reflect.apply(hook, { environment: { name: "client", config: { root: "/app", mode } } }, [source, id])
	const outside = "is a server function outside src/. Codegen registers only src/, so every call would be a 404"
	expect(() => run("/app/lib/echo.ts")).toThrow(`lib/echo.ts: echo ${outside}`)
	expect(() => run("/elsewhere/shared/echo.ts")).toThrow(`/elsewhere/shared/echo.ts: echo ${outside}`)
	expect(code(run("/app/src/fns/echo.ts"))).toContain("__id")
	expect(code(run("/app/lib/echo.ts", "test"))).toContain("__id")
	const flareSource = fileURLToPath(new URL("../../exports/server-fn.ts", import.meta.url))
	for (const id of ["/app/node_modules/x/echo.ts", "/elsewhere/node_modules/x/echo.ts", flareSource]) {
		expect(run(id)).toBeNull()
	}
	expect(run("/app/lib/plain.ts", undefined, "export const createServerFn = 1;\n")).toBeNull()
})

it("hmr keeps split", async () => {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "flare-hmr-")))
	mkdirSync(join(root, "src"))
	writeFileSync(join(root, "flare-stub.ts"), "export const createPage = (id: string) => ({ id });\n")
	const file = join(root, "src/a.page.ts")
	const source =
		'import { createPage } from "@lovrozagar/flare";\nexport const route = createPage("_root_/a").loader(() => "LOADER_BODY").render(() => "page");\n'
	writeFileSync(file, source)
	const boundary = flare().find((item) => item.name === "flare:boundary")
	const server = await createServer({
		root,
		configFile: false,
		logLevel: "silent",
		plugins: boundary === undefined ? [] : [boundary],
		resolve: { alias: { "@lovrozagar/flare": join(root, "flare-stub.ts") } },
		server: { middlewareMode: true, hmr: false, ws: false },
	})
	try {
		const client = server.environments.client
		expect((await client.transformRequest("/src/a.page.ts"))?.code).not.toContain("LOADER_BODY")
		// An edit, then the re-request a hot update makes.
		writeFileSync(file, source.replace("LOADER_BODY", "LOADER_EDIT"))
		const changed = await client.moduleGraph.getModuleByUrl("/src/a.page.ts")
		if (changed !== undefined) client.moduleGraph.invalidateModule(changed)
		const hot = (await client.transformRequest("/src/a.page.ts?t=1700000000000"))?.code ?? ""
		expect(hot).toContain('createPage("_root_/a").render(')
		expect(hot).not.toContain("LOADER_EDIT")
		expect((await client.transformRequest("/src/a.page.ts?v=abc123"))?.code).not.toContain("LOADER_EDIT")
	} finally {
		await server.close()
		rmSync(root, { recursive: true, force: true })
	}
}, 30_000)
