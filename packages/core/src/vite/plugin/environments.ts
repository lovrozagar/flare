import type { BuilderOptions, UserConfig } from "vite";

export type EnvName = "client" | "ssr" | "worker";

export type ClientBuild = { outDir: string; manifest: true; cssCodeSplit: false; assetsDir: string };
export type SsrBuild = { outDir: string; input: string };

// What a built file's URL is made of: Vite's resolved `base` and flare's `assetsBase`.
export type Urls = { base: string; assetsBase: string };

export function environmentOrder(worker: boolean): EnvName[] {
	const order: EnvName[] = ["client", "ssr"];
	if (worker) order.push("worker");
	return order;
}

// The directory built files go to under the client output: the assets base without its slash, and `assets` for a
// base of `/`, whose URL prefix is `/` (B89).
export function assetsDirOf(assetsBase: string): string {
	return assetsBase === "/" ? "assets" : assetsBase.slice(1);
}

// The one resolver for the URL of a built file, by its path in the client output (bits/12 `urls agree`): the client
// entry, the stylesheet, every URL Vite writes into CSS and JavaScript, and the seeds. Under `assetsBase: "/"` the
// `assets/` directory is not part of the URL.
export function assetUrl(file: string, urls: Urls): string {
	const path = urls.assetsBase === "/" && file.startsWith("assets/") ? file.slice("assets/".length) : file;
	return `${urls.base}${path}`;
}

// Where prerender writes the seeds and `createAssetsStore` reads them: a path in the client output, which a file read
// or the Workers assets binding serves. It has no Vite `base` (dx/store.md).
export function seedBase(assetsBase: string): string {
	return `/${assetsDirOf(assetsBase)}/_flare-static`;
}

// A caller's `build.assetsDir` must be the directory `assetsBase` gives. A caller's `outDir` replaces `dist`.
export function environmentBuild(
	options: { assetsBase?: string; assetsDir?: string | undefined; outDir?: string | undefined } = {},
): {
	client: ClientBuild;
	ssr: SsrBuild;
} {
	const assetsDir = assetsDirOf(options.assetsBase ?? "/assets");
	if (options.assetsDir !== undefined && options.assetsDir !== assetsDir) throw new Error("assets");
	const out = options.outDir ?? "dist";
	return {
		client: { outDir: `${out}/client`, manifest: true, cssCodeSplit: false, assetsDir },
		ssr: { outDir: `${out}/server`, input: "server.js" },
	};
}

export type BuildInput = {
	assetsBase: string;
	entry: { client: string; server: string };
	user: { outDir?: string | undefined; assetsDir?: string | undefined };
};

// The client and ssr environments and the order the builder runs them in (B89). The client entry is
// `<assetsDir>/client-[hash].js` and its chunks `<assetsDir>/[hash].js`. The server is one minified file with
// sourcemaps.
export function buildConfig(input: BuildInput): Pick<UserConfig, "environments"> & { builder: BuilderOptions } {
	const build = environmentBuild({ assetsBase: input.assetsBase, ...input.user });
	const { assetsDir } = build.client;
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
			ssr: {
				build: {
					outDir: build.ssr.outDir,
					minify: true,
					sourcemap: true,
					rolldownOptions: { input: { server: input.entry.server }, output: { entryFileNames: build.ssr.input } },
				},
			},
		},
		builder: {
			// One config and one plugin set for every environment, so what the client build captures, its stylesheet,
			// reaches the server builds. Without it Vite resolves the config again per environment, and a config file's
			// flare() call makes new plugins.
			sharedConfigBuild: true,
			sharedPlugins: true,
			// Solid's `solid:client-build-first` may already have built the client. Each environment builds once.
			async buildApp(builder) {
				for (const name of environmentOrder(false)) {
					const environment = builder.environments[name];
					if (environment !== undefined && !environment.isBuilt) await builder.build(environment);
				}
			},
		},
	};
}

type ViteManifest = Record<string, { file: string }>;

// The dev URL is the project-relative entry. A production URL is the entry's hashed file through `assetUrl`, and a
// missing entry is a build error.
export function clientUrl(input: { entry: string; manifest?: ViteManifest; urls?: Urls }): string {
	if (input.manifest === undefined) return `/${input.entry}`;
	const built = input.manifest[input.entry];
	if (built === undefined) throw new Error(`The client entry ${input.entry} is not in the Vite manifest`);
	return assetUrl(built.file, input.urls ?? { base: "/", assetsBase: "/assets" });
}
