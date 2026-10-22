import { existsSync, statSync } from "node:fs"
import { isAbsolute, relative, resolve, sep } from "node:path"
import solid from "@solidjs/vite-plugin"
import type { Plugin, UserConfig } from "vite"
import { graphOf } from "../boundary/index.ts"
import { chunkReferences, fillClosures, watchGenerated, writeGenerated, type CodegenFailure } from "../codegen/index.ts"
import { inject } from "../css/index.ts"
import { imageEndpoint, imagePlugin } from "../../features/image/vite/index.ts"
import { devEndpoints, targetGuard } from "../dev/guard.ts"
import { prerenderApp } from "../prerender/index.ts"
import { devHead as devHeadOf } from "../dev/dev-head.ts"
import { installDevStyles } from "../dev/dev-styles.ts"
import { cssUpdate } from "../dev/css-update.ts"
import { installDevHandler } from "../dev/handler.ts"
import { buildIdPlugin, buildInfoSource } from "./build-id.ts"
import { ownModule } from "./own-module.ts"
import { fontsPlugin } from "./fonts.ts"
import { assetUrl, buildConfig, environmentBuild, PRERENDER_ENV, serverBundled } from "./environments.ts"
import { readWrangler } from "./wrangler.ts"
import { assetHeadersPlugin } from "./asset-headers.ts"
import { realPath } from "./real-path.ts"
import { boundary } from "./boundary.ts"
import { preloadPlugin } from "./preload.ts"
import { checkCloudflare, composesCloudflare, WORKER_MAIN } from "./cloudflare.ts"
import { assertHost, parseOptions, type FlareOptions, type ParsedOptions } from "./options.ts"
import { peerGuard } from "./peers.ts"
import { productionConditions } from "./conditions.ts"

// The environments that run the server entry. Each loads build-info.ts with the build id and the client entry URL.
const SERVER_ENVIRONMENTS = new Set(["ssr", PRERENDER_ENV])

// The module the server reads its build id and client entry from. The package ships its source.
const BUILD_INFO = ownModule("../../server/lifecycle/build-info.ts", import.meta.url)

// The cross-tab switch. `flare({ broadcast: false })` replaces it in the client environment (dx/plugin.md).
const SYNC_ENABLED = ownModule("../../client/sync/enabled.ts", import.meta.url)
const BROADCAST_OFF = "export const broadcastEnabled = false;\n"

// The worker entry `@lovrozagar/flare/worker` re-exports: the app's server behind the Workers adapter (B109).
const WORKER_ENTRY = "virtual:flare/worker"
const RESOLVED_WORKER = `\0${WORKER_ENTRY}`
const WORKERS_HANDLER = ownModule("../../adapters/workers/handler.ts", import.meta.url)

// The generated route module, whose `chunks` map the client build points at hashed files.
const ROUTES_GEN = "src/_gen/routes.gen.ts"

// Cloudflare Workers is the app's own plugin beside this one (B109).
export function flare(options?: FlareOptions): Plugin[] {
	return flarePlugins(parseOptions(options))
}

function flarePlugins(parsed: ParsedOptions): Plugin[] {
	const state: State = {
		base: "/",
		manifest: "",
		workerSource: "",
		root: process.cwd(),
		cloudflare: false,
		build: false,
		devHead: Promise.withResolvers(),
		codegen: {},
	}
	// `image` turns optimization on. Absent, no image plugin runs and sharp is never loaded (dx/plugin.md image).
	const image = parsed.image
	return [
		peerGuard({ image: image !== undefined }),
		productionConditions(),
		chunks(),
		workerEntry(state),
		assetHeadersPlugin(() => state.cloudflare),
		preloadPlugin(parsed.entry.client),
		boundary(),
		...(image === undefined ? [] : [imagePlugin(image, parsed.assetsBase)]),
		...solid({ ssr: true, extensions: [".tsx", ".jsx"] }),
		...inject({ reset: parsed.css.reset, clientEntry: parsed.entry.client, assetsBase: parsed.assetsBase }),
		core(parsed, state),
		buildIdPlugin(state),
		cssUpdate(),
		devEndpoints(image === undefined ? [] : [imageEndpoint(image, state)]),
		// `fonts` turns the build-time font copy on. Absent, the app serves `/fonts/...` itself (dx/plugin.md fonts).
		...(parsed.fonts === undefined ? [] : [fontsPlugin(parsed.fonts.dir)]),
	]
}

// The config, the build environments, the server's build info, the worker entry, and the dev server.
// What the config hook settles for the later hooks: Vite's resolved `base`, which every built URL starts with, where
// the client build writes its manifest, and the worker entry's source.
// `devHead` settles when the dev server starts (B95 (b)); a production run never reads it.
type State = {
	base: string
	manifest: string
	workerSource: string
	root: string
	// The app composes the Cloudflare plugin, found in the config hook (B109).
	cloudflare: boolean
	// The config hook runs for `vite build`, not the dev server.
	build: boolean
	devHead: PromiseWithResolvers<string>
	buildId?: string
	// The last dev codegen failure, which the dev handler answers documents with until a pass succeeds (BUGS.md 480).
	codegen: CodegenFailure
}

function core(parsed: ParsedOptions, state: State): Plugin {
	return {
		name: "flare",
		config(config: UserConfig, env): UserConfig {
			state.build = env.command === "build"
			return flareConfig(config, parsed, state)
		},
		configResolved(config) {
			assertHost(config.server.host)
			state.base = config.base
			state.root = config.root
			if (composesCloudflare(config.plugins) !== state.cloudflare) {
				throw new Error("flare() did not see the Cloudflare plugin in the config's plugins: list cloudflare() there")
			}
			const conditions = config.environments["ssr"]?.resolve.conditions ?? []
			if (state.cloudflare) checkCloudflare({ conditions, main: readWrangler(config.root)?.main })
		},
		// Codegen is always on: a build and `vite dev` write src/_gen first, and a failure fails the start (B89). Dev also
		// writes each route file's id string to its path's id; a build only checks it (BUGS.md 130).
		buildStart() {
			const { root, command, logger } = this.environment.config
			writeGenerated(root, command === "serve" ? { fixIds: true, log: (line) => logger.info(line) } : {})
		},
		// A build's server environments read the manifest the client build wrote, so the client builds first.
		load(id) {
			const { name, config } = this.environment
			if (id === SYNC_ENABLED) return parsed.broadcast || graphOf(name) !== "client" ? null : BROADCAST_OFF
			if (id !== BUILD_INFO || !SERVER_ENVIRONMENTS.has(name)) return null
			const urls = { base: state.base, assetsBase: parsed.assetsBase }
			const input = { command: config.command, entry: parsed.entry.client, manifest: state.manifest, urls }
			if (config.command !== "serve") return buildInfoSource({ ...input, devHead: "" })
			// In dev, the module waits for devHead, which the dev server computes as it starts.
			return state.devHead.promise.then((devHead) => buildInfoSource({ ...input, devHead }))
		},
		// First among the plugins' server hooks: the Cloudflare plugin's starts the worker, whose server info module waits
		// for devHead, so devHead starts before it (B95 (b)).
		configureServer: {
			order: "pre",
			handler(server) {
				// Before the Cloudflare plugin's handler, which would parse a `//` target into a host (BUGS.md 118).
				if (state.cloudflare) server.middlewares.use(targetGuard)
				watchGenerated(server, server.config.root, { failure: state.codegen })
				devHeadOf(server).then(state.devHead.resolve, state.devHead.reject)
				installDevStyles(server, resolve(server.config.root, parsed.entry.client))
				const listen = installDevHandler(server, parsed.entry.server, {
					head: state.devHead.promise,
					codegen: state.codegen,
				})
				// With the Cloudflare plugin, workerd answers through its post middleware, which a listener added from this
				// earlier hook would shadow (BUGS.md 76, B109).
				return state.cloudflare ? undefined : listen
			},
		},
	}
}

// The libraries flare's client code imports that an app does not import itself (B145's codec).
const CLIENT_LIBRARIES = ["@lovrozagar/flare > seroval", "@lovrozagar/flare > seroval-plugins/web"]

// The Vite config flare owns. Flare owns the entries and the dev server, so Vite serves no index.html (B89).
function flareConfig(config: UserConfig, parsed: ParsedOptions, state: State): UserConfig {
	// Vite gives module ids as real paths, so the root is one too: a root reached through a symlink would otherwise
	// put every app module outside it (BUGS.md B51).
	const root = realPath(resolve(config.root ?? process.cwd()))
	assertEntry(root, parsed.entry.client, "entry.client")
	assertEntry(root, parsed.entry.server, "entry.server")
	const entry = { client: resolve(root, parsed.entry.client), server: resolve(root, parsed.entry.server) }
	const user = { outDir: config.build?.outDir, assetsDir: config.build?.assetsDir }
	const client = environmentBuild({ assetsBase: parsed.assetsBase, ...user }).client.outDir
	state.manifest = resolve(root, client, ".vite/manifest.json")
	state.cloudflare = composesCloudflare(config.plugins)
	state.workerSource = state.cloudflare ? workerModule(entry.server, readWrangler(root)?.binding) : ""
	// Prerender runs once the server is built, and writes its seeds into the client output (bits/12). With the
	// Cloudflare plugin it runs from its own Node build of the server, also when off: a page that renders at build then
	// fails the build, naming the route, as without the plugin (dx/plugin.md Options, BUGS.md 497).
	const afterBuild = (built: { clientDir: string; serverFile: string }): Promise<void> =>
		prerenderApp({
			root,
			...built,
			assetsBase: parsed.assetsBase,
			config: parsed.prerender,
			...(state.cloudflare ? { workers: true } : {}),
		})
	return {
		root,
		appType: "custom",
		resolve: { dedupe: ["solid-js", "@solidjs/web"] },
		ssr: { noExternal: serverBundled(state.build) },
		// Flare is served as source, so the libraries only its client code imports are pre-bundled from its own place: a
		// first page load would otherwise find them, re-optimize, and reload the page (BUGS.md 254.4).
		optimizeDeps: { exclude: ["@lovrozagar/flare"], include: CLIENT_LIBRARIES },
		...buildConfig({
			assetsBase: parsed.assetsBase,
			entry,
			user,
			cloudflare: state.cloudflare,
			afterBuild,
		}),
		// A Web Worker bundle is a client graph: rewritten and scanned like the client (B9, B45).
		worker: { plugins: () => [boundary("client")] },
		// Every URL Vite writes into CSS and JavaScript comes from the same resolver as the server's.
		experimental: { renderBuiltUrl: (file) => assetUrl(file, { base: state.base, assetsBase: parsed.assetsBase }) },
	}
}

// The worker entry: the app's `server` export behind createWorkersHandler, forwarding an unmatched GET to the
// config's assets binding (dx/adapters.md).
function workerModule(server: string, binding: string | undefined): string {
	const options = binding === undefined ? "{}" : `{ assets: ${JSON.stringify(binding)} }`
	return [
		`import { server } from ${JSON.stringify(server)};`,
		`import { createWorkersHandler } from ${JSON.stringify(WORKERS_HANDLER)};`,
		`export default createWorkersHandler(server, ${options});`,
		"",
	].join("\n")
}

// The Wrangler config's `main`, `@lovrozagar/flare/worker`, is the app's server behind the Workers adapter. Resolved
// here, before Vite's own resolver reaches the package file, which only throws (B109).
function workerEntry(state: State): Plugin {
	return {
		name: "flare:worker-entry",
		enforce: "pre",
		resolveId(id) {
			return state.cloudflare && (id === WORKER_MAIN || id === WORKER_ENTRY) ? RESOLVED_WORKER : null
		},
		load(id) {
			return id === RESOLVED_WORKER ? state.workerSource : null
		},
	}
}

// A client build points the generated `chunks` map at the hashed files, before any other transform reprints the module.
function chunks(): Plugin {
	return {
		name: "flare:chunks",
		enforce: "pre",
		transform(code, id) {
			const { name, config } = this.environment
			if (name !== "client" || config.command !== "build" || id !== resolve(config.root, ROUTES_GEN)) return null
			return chunkReferences(code, (path) => this.emitFile({ type: "chunk", id: resolve(config.root, path.slice(1)) }))
		},
		// Each route's entry also names the chunks its file imports, now that the bundle is known (BUGS.md 124.6).
		generateBundle(_options, bundle) {
			const { name, config } = this.environment
			if (name !== "client" || config.command !== "build") return
			const chunks = Object.values(bundle).flatMap((file) => (file.type === "chunk" ? [file] : []))
			const filled = fillClosures(chunks, (ref) => this.getFileName(ref))
			for (const chunk of chunks) chunk.code = filled.get(chunk.fileName) ?? chunk.code
		},
	}
}

// A path relative to the project, to a file inside it (BUGS.md 419).
function assertEntry(root: string, entryPath: string, label: string): void {
	if (isAbsolute(entryPath)) throw new Error(label)
	const full = resolve(root, entryPath)
	// Out of the project is `..` or under it, or another drive; `..x.tsx` is a file inside it.
	const rel = relative(root, full)
	if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
		throw new Error(`${label} ${entryPath} is outside the project`)
	}
	if (!existsSync(full)) throw new Error(`${label} ${entryPath}`)
	if (!statSync(full).isFile()) throw new Error(`${label} ${entryPath} is not a file`)
}
