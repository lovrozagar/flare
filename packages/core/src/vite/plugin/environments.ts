import { rmSync } from "node:fs"
import { resolve } from "node:path"
import type { BuilderOptions, EnvironmentOptions, UserConfig } from "vite"

export type EnvName = "client" | "ssr" | typeof PRERENDER_ENV

// The Node build prerender runs when the Cloudflare plugin owns ssr, deleted once the seeds are written (B109).
export const PRERENDER_ENV = "flare_prerender"

export type ClientBuild = { outDir: string; manifest: true; cssCodeSplit: false; assetsDir: string }
export type SsrBuild = { outDir: string; input: string }

// What a built file's URL is made of: Vite's resolved `base` and flare's `assetsBase`.
export type Urls = { base: string; assetsBase: string }

export function environmentOrder(input: { cloudflare: boolean; prerender: boolean }): EnvName[] {
	const order: EnvName[] = ["client", "ssr"]
	if (input.cloudflare && input.prerender) order.push(PRERENDER_ENV)
	return order
}

// The directory built files go to under the client output: the assets base without its slash, and `assets` for a
// base of `/`, whose URL prefix is `/` (B89).
export function assetsDirOf(assetsBase: string): string {
	return assetsBase === "/" ? "assets" : assetsBase.slice(1)
}

// The one resolver for the URL of a built file, by its path in the client output (bits/12 `urls agree`): the client
// entry, the stylesheet, every URL Vite writes into CSS and JavaScript, and the seeds. Under `assetsBase: "/"` the
// `assets/` directory is not part of the URL.
export function assetUrl(file: string, urls: Urls): string {
	const path = urls.assetsBase === "/" && file.startsWith("assets/") ? file.slice("assets/".length) : file
	return `${urls.base}${path}`
}

// Where prerender writes the seeds and `createAssetsStore` reads them: a path in the client output, which a file read
// or the Workers assets binding serves. It has no Vite `base` (dx/store.md).
export function seedBase(assetsBase: string): string {
	return `/${assetsDirOf(assetsBase)}/_flare-static`
}

// A caller's `build.assetsDir` must be the directory `assetsBase` gives. A caller's `outDir` replaces `dist`.
export function environmentBuild(
	options: { assetsBase?: string; assetsDir?: string | undefined; outDir?: string | undefined } = {},
): {
	client: ClientBuild
	ssr: SsrBuild
} {
	const assetsDir = assetsDirOf(options.assetsBase ?? "/assets")
	if (options.assetsDir !== undefined && options.assetsDir !== assetsDir) throw new Error("assets")
	const out = options.outDir ?? "dist"
	return {
		client: { outDir: `${out}/client`, manifest: true, cssCodeSplit: false, assetsDir },
		ssr: { outDir: `${out}/server`, input: "server.js" },
	}
}

export type BuildInput = {
	assetsBase: string
	entry: { client: string; server: string }
	user: { outDir?: string | undefined; assetsDir?: string | undefined }
	// The app composes the Cloudflare plugin, which then owns the ssr build: the Workers bundle and its deploy config
	// (B109).
	cloudflare: boolean
	// What runs once every environment is built: prerender (bits/12). Absent, nothing runs.
	afterBuild?: ((built: { clientDir: string; serverFile: string }) => Promise<void>) | undefined
}

// The packages the server build bundles, as `ssr.noExternal` lists them for the ssr environment.
export const SERVER_BUNDLED: string[] = ["solid-js", "@solidjs/web", "@lovrozagar/flare", "@tanstack/solid-query"]

// The client and ssr environments and the order the builder runs them in (B89). The client entry is
// `<assetsDir>/client-[hash].js` and its chunks `<assetsDir>/[hash].js`. The server is one minified file with
// sourcemaps. With the Cloudflare plugin, the plugin names the ssr output, and prerender gets its own Node build of the
// server, which no deploy ships (B109).
export function buildConfig(input: BuildInput): Pick<UserConfig, "environments"> & { builder: BuilderOptions } {
	const build = environmentBuild({ assetsBase: input.assetsBase, ...input.user })
	const { assetsDir } = build.client
	const prerender = input.cloudflare && input.afterBuild !== undefined
	const serverDir = prerender ? build.ssr.outDir.replace(/server$/, "prerender") : build.ssr.outDir
	return {
		environments: {
			client: {
				build: {
					...build.client,
					rolldownOptions: {
						input: input.entry.client,
						output: { entryFileNames: `${assetsDir}/client-[hash].js`, chunkFileNames: `${assetsDir}/[hash].js` },
					},
				},
			},
			// `public/` ships once, with the client (BUGS.md B11).
			ssr: input.cloudflare
				? { build: { outDir: build.ssr.outDir, copyPublicDir: false, minify: true, sourcemap: true } }
				: { build: serverBuild(build.ssr.outDir, input.entry.server, build.ssr.input) },
			...(prerender
				? {
						[PRERENDER_ENV]: {
							consumer: "server",
							resolve: { noExternal: SERVER_BUNDLED },
							build: serverBuild(serverDir, input.entry.server, build.ssr.input),
						},
					}
				: {}),
		},
		builder: {
			// One config and one plugin set for every environment, so what the client build captures, its stylesheet,
			// reaches the server builds. Without it Vite resolves the config again per environment, and a config file's
			// flare() call makes new plugins.
			sharedConfigBuild: true,
			sharedPlugins: true,
			// Solid's `solid:client-build-first` may already have built the client. Each environment builds once.
			async buildApp(builder) {
				for (const name of environmentOrder({ cloudflare: input.cloudflare, prerender })) {
					const environment = builder.environments[name]
					if (environment !== undefined && !environment.isBuilt) await builder.build(environment)
				}
				const root = builder.config.root
				const serverFile = resolve(root, serverDir, build.ssr.input)
				try {
					await input.afterBuild?.({ clientDir: resolve(root, build.client.outDir), serverFile })
				} finally {
					if (prerender) rmSync(resolve(root, serverDir), { recursive: true, force: true })
				}
			},
		},
	}
}

// The server as one minified Node file with sourcemaps. `public/` ships once, with the client (BUGS.md B11).
function serverBuild(outDir: string, entry: string, file: string): NonNullable<EnvironmentOptions["build"]> {
	return {
		outDir,
		copyPublicDir: false,
		minify: true,
		sourcemap: true,
		rolldownOptions: { input: { server: entry }, output: { entryFileNames: file } },
	}
}

type ViteManifest = Record<string, { file: string }>

// The dev URL is the project-relative entry. A production URL is the entry's hashed file through `assetUrl`, and a
// missing entry is a build error.
export function clientUrl(input: { entry: string; manifest?: ViteManifest; urls?: Urls }): string {
	if (input.manifest === undefined) return `/${input.entry}`
	const built = input.manifest[input.entry]
	if (built === undefined) throw new Error(`The client entry ${input.entry} is not in the Vite manifest`)
	return assetUrl(built.file, input.urls ?? { base: "/", assetsBase: "/assets" })
}
