import type { Plugin } from "vite";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* Mock vite-plugin-solid to avoid esbuild binary in jsdom */
vi.mock("vite-plugin-solid", () => ({
	default: (opts: Record<string, unknown>) => ({ config: () => ({ solid: opts }), name: "solid" }),
}));

/* flare() plugin scans cwd for src/client.tsx and src/server.ts — create stubs */
/* resolver plugin checks for dist/ directory — create stub for resolver tests */
import { existsSync, mkdirSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const _stubs: string[] = [];
const _stubDirs: string[] = [];
for (const name of ["src/client.tsx", "src/server.ts", "src/custom.client.tsx", "src/custom.server.ts"]) {
	const p = join(process.cwd(), name);
	if (!existsSync(p)) {
		writeFileSync(p, "/* test stub */");
		_stubs.push(p);
	}
}
const distDir = join(process.cwd(), "dist");
if (!existsSync(distDir)) {
	mkdirSync(distDir, { recursive: true });
	_stubDirs.push(distDir);
}

import { afterAll } from "vitest";

afterAll(() => {
	for (const p of _stubs)
		try {
			unlinkSync(p);
		} catch {}
	for (const d of _stubDirs)
		try {
			rmdirSync(d);
		} catch {}
});

/* Mock generators to avoid filesystem access in plugin tests */
vi.mock("../../../src/generators", () => ({
	buildRouteTree: vi.fn<() => { s: Record<string, unknown> }>(() => ({ s: {} })),
	deriveVirtualPath: vi.fn<() => string>(() => "_root_/test"),
	detectRouteType: vi.fn<() => string>(() => "page"),
	extractCacheFromChain: vi.fn<() => Record<string, unknown>>(() => ({})),
	extractRouteDefinitions: vi.fn<() => unknown[]>(() => []),
	generateLayoutsRecord: vi.fn<() => void>(),
	generateRouteInserts: vi.fn<() => void>(),
	generateRoutesFile: vi.fn<() => void>(),
	generateVirtualModuleTypes: vi.fn<() => string>(() => ""),
	runGenerate: vi.fn<() => { layouts: number; routes: number }>(() => ({
		layouts: 0,
		routes: 0,
	})),
	scanSourceFiles: vi.fn<() => unknown[]>(() => []),
	scanSourceFilesFsCodegen: vi.fn<() => unknown[]>(() => []),
	serializeTreeNode: vi.fn<() => string>(() => "{ s: E }"),
	validateRouteDefinitions: vi.fn<() => unknown[]>(() => []),
	writeRouteDeclaration: vi.fn<() => void>(),
}));

import { runGenerate } from "../../../src/generators/index.ts";

import {
	createCssScopePlugin,
	createCssTransformPlugin,
	createServerFnPlugin,
	flare,
} from "../../../src/plugins/index.ts";

function isPlugin(p: import("vite").PluginOption): p is Plugin {
	return typeof p === "object" && p !== null && "name" in p;
}

function flarePlugins(...args: Parameters<typeof flare>): Plugin[] {
	return flare(...args).filter(isPlugin);
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("flare", () => {
	it("returns array of 16 plugins by default", () => {
		const plugins = flarePlugins({});
		expect(plugins).toHaveLength(16);
	});

	it("plugin names correct and in order", () => {
		const plugins = flarePlugins({});
		const names = plugins.map((p: { name?: string }) => p.name);
		expect(names).toEqual([
			"flare:tw-deprecated",
			"flare:css-scope",
			"solid",
			"flare:image",
			"flare:resolver",
			"flare:generate",
			"flare:ssr-build",
			"flare:dev-server",
			"flare:preview-server",
			"flare:virtual",
			"flare:server-fn",
			"flare:css-transform",
			"flare:service-worker",
			"flare:dev-dashboard",
			"flare:dev-cdn-cache",
			"flare:dev-prerender",
		]);
	});

	it("dev: false excludes dev-prerender, dev-cdn-cache, and dev-dashboard plugins", () => {
		const plugins = flarePlugins({ dev: false });
		const names = plugins.map((p: { name?: string }) => p.name);
		expect(names).not.toContain("flare:dev-prerender");
		expect(names).not.toContain("flare:dev-cdn-cache");
		expect(names).not.toContain("flare:dev-dashboard");
	});

	it("dev: { cdnCache: false } excludes dev-cdn-cache but keeps dev-prerender", () => {
		const plugins = flarePlugins({ dev: { cdnCache: false } });
		const names = plugins.map((p: { name?: string }) => p.name);
		expect(names).not.toContain("flare:dev-cdn-cache");
		expect(names).toContain("flare:dev-prerender");
	});

	it("resolver enforce: pre", () => {
		const plugins = flarePlugins({});
		const resolver = plugins.find((p) => p.name === "flare:resolver");
		expect(resolver?.enforce).toBe("pre");
	});
});

describe("flare:resolver", () => {
	it("resolves flare SSR imports", () => {
		const plugins = flarePlugins({});
		const resolver = plugins.find((p) => p.name === "flare:resolver");
		const resolveId = resolver?.resolveId as
			| ((id: string, _: unknown, opts: { ssr?: boolean }) => string | null)
			| undefined;

		if (!resolveId) throw new Error("resolveId not found");

		const result = resolveId.call({ environment: { name: "ssr" } }, "@lovrozagar/flare/ssr", undefined, {
			ssr: true,
		});
		expect(result).toContain("dist/ssr/");
	});

	it("resolves flare client imports", () => {
		const plugins = flarePlugins({});
		const resolver = plugins.find((p) => p.name === "flare:resolver");
		const resolveId = resolver?.resolveId as
			| ((id: string, _: unknown, opts: { ssr?: boolean }) => string | null)
			| undefined;

		if (!resolveId) throw new Error("resolveId not found");

		const result = resolveId.call({ environment: { name: "client" } }, "@lovrozagar/flare/link", undefined, {
			ssr: false,
		});
		expect(result).toContain("dist/client/");
	});

	it("non-flare import → null (pass through)", () => {
		const plugins = flarePlugins({});
		const resolver = plugins.find((p) => p.name === "flare:resolver");
		const resolveId = resolver?.resolveId as
			| ((id: string, _: unknown, opts: { ssr?: boolean }) => string | null)
			| undefined;

		if (!resolveId) throw new Error("resolveId not found");

		const result = resolveId.call({ environment: { name: "client" } }, "lodash", undefined, {});
		expect(result).toBeNull();
	});
});

describe("flare:generate", () => {
	it("buildStart calls runGenerate", () => {
		const plugins = flarePlugins({});
		const gen = plugins.find((p) => p.name === "flare:generate");
		const buildStart = gen?.buildStart as (() => void) | undefined;

		if (!buildStart) throw new Error("buildStart not found");

		buildStart.call({ environment: { config: { root: "/tmp/test" } } });
		expect(runGenerate).toHaveBeenCalledWith({
			fsCodegen: true,
			ignorePrefix: "_",
			outputPath: "src/_gen/routes.gen.ts",
			rootDir: "/tmp/test",
			typesOutputPath: "src/_gen/types.gen.d.ts",
		});
	});

	it("buildStart uses custom codegen config", () => {
		const plugins = flarePlugins({
			codegen: { routesFilePath: "src/generated/routes.gen.ts" },
			ignorePrefix: "__",
		});
		const gen = plugins.find((p) => p.name === "flare:generate");
		const buildStart = gen?.buildStart as (() => void) | undefined;

		if (!buildStart) throw new Error("buildStart not found");

		buildStart.call({ environment: { config: { root: "/app" } } });
		expect(runGenerate).toHaveBeenCalledWith({
			fsCodegen: true,
			ignorePrefix: "__",
			outputPath: "src/generated/routes.gen.ts",
			rootDir: "/app",
			typesOutputPath: "src/_gen/types.gen.d.ts",
		});
	});

	it("configureServer exists", () => {
		const plugins = flarePlugins({});
		const gen = plugins.find((p) => p.name === "flare:generate");
		expect(gen?.configureServer).toBeDefined();
	});

	it("buildStart uses fsCodegen: false when fsVirtualPaths is false", () => {
		const plugins = flarePlugins({ codegen: { fsVirtualPaths: false } });
		const gen = plugins.find((p) => p.name === "flare:generate");
		const buildStart = gen?.buildStart as (() => void) | undefined;
		if (!buildStart) throw new Error("buildStart not found");
		buildStart.call({ environment: { config: { root: "/tmp/str" } } });
		expect(runGenerate).toHaveBeenCalledWith({
			fsCodegen: false,
			ignorePrefix: "_",
			outputPath: "src/_gen/routes.gen.ts",
			rootDir: "/tmp/str",
			typesOutputPath: "src/_gen/types.gen.d.ts",
		});
	});

	it("buildStart uses fsCodegen: true when fsVirtualPaths is true", () => {
		const plugins = flarePlugins({ codegen: { fsVirtualPaths: true } });
		const gen = plugins.find((p) => p.name === "flare:generate");
		const buildStart = gen?.buildStart as (() => void) | undefined;
		if (!buildStart) throw new Error("buildStart not found");
		buildStart.call({ environment: { config: { root: "/tmp/fs" } } });
		expect(runGenerate).toHaveBeenCalledWith(expect.objectContaining({ fsCodegen: true, rootDir: "/tmp/fs" }));
	});
});

describe("flare:ssr-build", () => {
	it("configures dual environment output dirs", () => {
		const plugins = flarePlugins({});
		const ssrBuild = plugins.find((p) => p.name === "flare:ssr-build");
		const config = ssrBuild?.config as (() => Record<string, unknown>) | undefined;

		if (!config) throw new Error("config not found");

		const result = config.call({}) as Record<string, unknown>;
		const envs = result.environments as Record<string, { build: { outDir: string } }>;

		expect(envs?.client?.build?.outDir).toBe("dist/client");
		expect(envs?.ssr?.build?.outDir).toBe("dist/server");
	});

	it("builder.sharedPlugins is true", () => {
		const plugins = flarePlugins({});
		const ssrBuild = plugins.find((p) => p.name === "flare:ssr-build");
		const config = ssrBuild?.config as (() => Record<string, unknown>) | undefined;

		if (!config) throw new Error("config not found");

		const result = config.call({}) as { builder?: { sharedPlugins?: boolean } };
		expect(result.builder?.sharedPlugins).toBe(true);
	});

	it("builder.buildApp builds client then ssr sequentially", async () => {
		const plugins = flarePlugins({});
		const ssrBuild = plugins.find((p) => p.name === "flare:ssr-build");
		const config = ssrBuild?.config as (() => Record<string, unknown>) | undefined;

		if (!config) throw new Error("config not found");

		const result = config.call({}) as {
			builder?: {
				buildApp?: (builder: {
					build: (env: unknown) => Promise<void>;
					environments: Record<string, unknown>;
				}) => Promise<void>;
			};
		};
		expect(result.builder?.buildApp).toBeDefined();

		const buildOrder: string[] = [];
		const mockBuilder = {
			build: async (env: unknown) => {
				if (env === "client-env") buildOrder.push("client");
				else if (env === "ssr-env") buildOrder.push("ssr");
			},
			environments: { client: "client-env", ssr: "ssr-env" },
		};

		await result.builder?.buildApp?.(mockBuilder);
		expect(buildOrder).toEqual(["client", "ssr"]);
	});

	it("solid deduplicated in resolve.dedupe", () => {
		const plugins = flarePlugins({});
		const ssrBuild = plugins.find((p) => p.name === "flare:ssr-build");
		const config = ssrBuild?.config as (() => Record<string, unknown>) | undefined;

		if (!config) throw new Error("config not found");

		const result = config.call({}) as {
			resolve?: { dedupe?: string[] };
		};
		expect(result.resolve?.dedupe).toContain("solid-js");
	});

	it("solid in ssr.noExternal", () => {
		const plugins = flarePlugins({});
		const ssrBuild = plugins.find((p) => p.name === "flare:ssr-build");
		const config = ssrBuild?.config as (() => Record<string, unknown>) | undefined;

		if (!config) throw new Error("config not found");

		const result = config.call({}) as {
			ssr?: { noExternal?: string[] };
		};
		expect(result.ssr?.noExternal).toContain("solid-js");
		expect(result.ssr?.noExternal).toContain("@lovrozagar/flare");
	});

	it("_gen/ watch exclusion configured", () => {
		const plugins = flarePlugins({});
		const ssrBuild = plugins.find((p) => p.name === "flare:ssr-build");
		const config = ssrBuild?.config as (() => Record<string, unknown>) | undefined;

		if (!config) throw new Error("config not found");

		const result = config.call({}) as {
			server?: { watch?: { ignored?: string[] } };
		};
		expect(result.server?.watch?.ignored).toContain("**/_gen/**");
		expect(result.server?.watch?.ignored).toContain("**/*.gen.ts");
		expect(result.server?.watch?.ignored).toContain("**/*.gen.tsx");
	});

	it("alias option → resolve.alias in vite config", () => {
		const plugins = flarePlugins({ alias: { "@": "/src", "@components": "/src/components" } });
		const ssrBuild = plugins.find((p) => p.name === "flare:ssr-build");
		const config = ssrBuild?.config as (() => Record<string, unknown>) | undefined;

		if (!config) throw new Error("config not found");

		const result = config.call({}) as {
			resolve?: { alias?: Record<string, string> };
		};
		expect(result.resolve?.alias).toEqual({ "@": "/src", "@components": "/src/components" });
	});

	it("no alias → no resolve.alias key", () => {
		const plugins = flarePlugins({});
		const ssrBuild = plugins.find((p) => p.name === "flare:ssr-build");
		const config = ssrBuild?.config as (() => Record<string, unknown>) | undefined;

		if (!config) throw new Error("config not found");

		const result = config.call({}) as {
			resolve?: { alias?: Record<string, string> };
		};
		expect(result.resolve?.alias).toBeUndefined();
	});

	it("port option → server.port in vite config", () => {
		const plugins = flarePlugins({ port: 4000 });
		const ssrBuild = plugins.find((p) => p.name === "flare:ssr-build");
		const config = ssrBuild?.config as (() => Record<string, unknown>) | undefined;

		if (!config) throw new Error("config not found");

		const result = config.call({}) as {
			server?: { port?: number };
		};
		expect(result.server?.port).toBe(4000);
	});

	it("no port → no server.port key", () => {
		const plugins = flarePlugins({});
		const ssrBuild = plugins.find((p) => p.name === "flare:ssr-build");
		const config = ssrBuild?.config as (() => Record<string, unknown>) | undefined;

		if (!config) throw new Error("config not found");

		const result = config.call({}) as {
			server?: { port?: number };
		};
		expect(result.server?.port).toBeUndefined();
	});
});

describe("flare:virtual", () => {
	it("resolves virtual:flare-config", () => {
		const plugins = flarePlugins({});
		const virtual = plugins.find((p) => p.name === "flare:virtual");
		const resolveId = virtual?.resolveId as ((id: string) => string | null) | undefined;

		if (!resolveId) throw new Error("resolveId not found");

		const result = resolveId.call({}, "virtual:flare-config");
		expect(result).toBe("\0virtual:flare-config");
	});

	it("resolves virtual:flare-client-entry", () => {
		const plugins = flarePlugins({});
		const virtual = plugins.find((p) => p.name === "flare:virtual");
		const resolveId = virtual?.resolveId as ((id: string) => string | null) | undefined;

		if (!resolveId) throw new Error("resolveId not found");

		const result = resolveId.call({}, "virtual:flare-client-entry");
		expect(result).toBe("\0virtual:flare-client-entry");
	});

	it("resolves virtual:flare-generated", () => {
		const plugins = flarePlugins({});
		const virtual = plugins.find((p) => p.name === "flare:virtual");
		const resolveId = virtual?.resolveId as ((id: string) => string | null) | undefined;

		if (!resolveId) throw new Error("resolveId not found");

		const result = resolveId.call({}, "virtual:flare-generated");
		expect(result).toBe("\0virtual:flare-generated");
	});

	it("resolves virtual:flare-is-dev", () => {
		const plugins = flarePlugins({});
		const virtual = plugins.find((p) => p.name === "flare:virtual");
		const resolveId = virtual?.resolveId as ((id: string) => string | null) | undefined;

		if (!resolveId) throw new Error("resolveId not found");

		const result = resolveId.call({}, "virtual:flare-is-dev");
		expect(result).toBe("\0virtual:flare-is-dev");
	});

	it("non-virtual → null", () => {
		const plugins = flarePlugins({});
		const virtual = plugins.find((p) => p.name === "flare:virtual");
		const resolveId = virtual?.resolveId as ((id: string) => string | null) | undefined;

		if (!resolveId) throw new Error("resolveId not found");

		const result = resolveId.call({}, "other-module");
		expect(result).toBeNull();
	});

	it("load virtual:flare-config → serialized config", () => {
		const plugins = flarePlugins({ ignorePrefix: "__" });
		const virtual = plugins.find((p) => p.name === "flare:virtual");
		const load = virtual?.load as ((id: string) => { code: string; moduleType: string } | null) | undefined;

		if (!load) throw new Error("load not found");

		const result = load.call({}, "\0virtual:flare-config");
		expect(result?.moduleType).toBe("js");
		expect(result?.code).toContain("export default");
		expect(result?.code).toContain("__");
	});

	it("load virtual:flare-client-entry (dev) → source path", () => {
		const plugins = flarePlugins({});
		const virtual = plugins.find((p) => p.name === "flare:virtual");
		const load = virtual?.load as
			| ((
					this: { environment?: { config?: { mode?: string; root?: string } } },
					id: string,
			  ) => { code: string; moduleType: string } | null)
			| undefined;

		if (!load) throw new Error("load not found");

		const result = load.call({ environment: { config: { mode: "development" } } }, "\0virtual:flare-client-entry");
		expect(result?.code).toMatch(/\/src\/client\.tsx?"/);
	});

	it("load virtual:flare-generated → re-exports routeTree and layouts", () => {
		const plugins = flarePlugins({});
		const virtual = plugins.find((p) => p.name === "flare:virtual");
		const load = virtual?.load as ((id: string) => { code: string; moduleType: string } | null) | undefined;

		if (!load) throw new Error("load not found");

		const result = load.call({ environment: { config: { root: "/app" } } }, "\0virtual:flare-generated");
		expect(result?.code).toContain("routeTree");
		expect(result?.code).toContain("layouts");
		expect(result?.code).toContain("routes.gen.ts");
	});

	it("load virtual:flare-is-dev → true for development mode", () => {
		const plugins = flarePlugins({});
		const virtual = plugins.find((p) => p.name === "flare:virtual");
		const load = virtual?.load as ((id: string) => { code: string; moduleType: string } | null) | undefined;

		if (!load) throw new Error("load not found");

		const result = load.call({ environment: { config: { mode: "development" } } }, "\0virtual:flare-is-dev");
		expect(result?.code).toBe("export default true");
	});

	it("load virtual:flare-is-dev → false for production mode", () => {
		const plugins = flarePlugins({});
		const virtual = plugins.find((p) => p.name === "flare:virtual");
		const load = virtual?.load as ((id: string) => { code: string; moduleType: string } | null) | undefined;

		if (!load) throw new Error("load not found");

		const result = load.call({ environment: { config: { mode: "production" } } }, "\0virtual:flare-is-dev");
		expect(result?.code).toBe("export default false");
	});

	it("resolves virtual:flare-log-level", () => {
		const plugins = flarePlugins({});
		const virtual = plugins.find((p) => p.name === "flare:virtual");
		const resolveId = virtual?.resolveId as ((id: string) => string | null) | undefined;

		if (!resolveId) throw new Error("resolveId not found");

		expect(resolveId.call({}, "virtual:flare-log-level")).toBe("\0virtual:flare-log-level");
	});

	it("load virtual:flare-log-level → default warn in dev", () => {
		const plugins = flarePlugins({});
		const virtual = plugins.find((p) => p.name === "flare:virtual");
		const load = virtual?.load as ((id: string) => { code: string; moduleType: string } | null) | undefined;

		if (!load) throw new Error("load not found");

		const result = load.call({ environment: { config: { mode: "development" } } }, "\0virtual:flare-log-level");
		expect(result?.code).toBe('export default "warn"');
	});

	it("load virtual:flare-log-level → default error in production", () => {
		const plugins = flarePlugins({});
		const virtual = plugins.find((p) => p.name === "flare:virtual");
		const load = virtual?.load as ((id: string) => { code: string; moduleType: string } | null) | undefined;

		if (!load) throw new Error("load not found");

		const result = load.call({ environment: { config: { mode: "production" } } }, "\0virtual:flare-log-level");
		expect(result?.code).toBe('export default "error"');
	});

	it("load virtual:flare-log-level → custom logLevel overrides default", () => {
		const plugins = flarePlugins({ logLevel: "verbose" });
		const virtual = plugins.find((p) => p.name === "flare:virtual");
		const load = virtual?.load as ((id: string) => { code: string; moduleType: string } | null) | undefined;

		if (!load) throw new Error("load not found");

		const result = load.call({ environment: { config: { mode: "production" } } }, "\0virtual:flare-log-level");
		expect(result?.code).toBe('export default "verbose"');
	});
});

describe("solid plugin", () => {
	it("solid plugin included in array", () => {
		const plugins = flarePlugins({});
		const solidPlugin = plugins.find((p: { name?: string }) => p.name === "solid");
		expect(solidPlugin).toBeDefined();
	});

	it("tw-deprecated is first plugin, css-scope is second, solid is third", () => {
		const plugins = flarePlugins({});
		expect((plugins[0] as { name?: string }).name).toBe("flare:tw-deprecated");
		expect((plugins[1] as { name?: string }).name).toBe("flare:css-scope");
		expect((plugins[2] as { name?: string }).name).toBe("solid");
	});

	it("solid option passes through to vite-plugin-solid", () => {
		const plugins = flarePlugins({ solid: { dev: false } });
		const solidPlugin = plugins.find((p: { name?: string }) => p.name === "solid");
		const config = (solidPlugin as { config?: () => Record<string, unknown> })?.config;
		if (!config) throw new Error("config not found");
		const result = config() as { solid?: Record<string, unknown> };
		expect(result.solid?.dev).toBe(false);
	});
});

describe("flare:service-worker", () => {
	it("default → service-worker-disabled plugin", () => {
		const plugins = flarePlugins({});
		const sw = plugins.find((p) => p.name === "flare:service-worker");
		expect(sw).toBeDefined();
	});

	it("serviceWorker: false → disabled plugin", () => {
		const plugins = flarePlugins({ serviceWorker: false });
		const sw = plugins.find((p) => p.name === "flare:service-worker");
		expect(sw).toBeDefined();
	});

	it("serviceWorker: { offlineFallback } → enabled plugin", () => {
		const plugins = flarePlugins({ serviceWorker: { offlineFallback: "/offline" } });
		const sw = plugins.find((p) => p.name === "flare:service-worker");
		expect(sw).toBeDefined();
	});

	it("serviceWorker: true → enabled plugin", () => {
		const plugins = flarePlugins({ serviceWorker: true });
		const sw = plugins.find((p) => p.name === "flare:service-worker");
		expect(sw).toBeDefined();
	});
});

describe("createCssScopePlugin", () => {
	it("returns plugin with name", () => {
		const plugin = createCssScopePlugin();
		expect(plugin.name).toBe("flare:css-scope");
	});

	it("transforms css= attribute to data-c + registerCSSByName with build-time hash", () => {
		const plugin = createCssScopePlugin();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | null;

		const result = transform.call({}, '<div css="color: red; font-size: 2rem">', "component.tsx");
		expect(result?.code).toContain("data-c");
		expect(result?.code).toContain("__flare_registerCSSByName__");
		expect(result?.code).toContain("color: red");
	});

	it("no css= → null (unchanged)", () => {
		const plugin = createCssScopePlugin();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | null;

		const result = transform.call({}, '<div class="foo">', "component.tsx");
		expect(result).toBeNull();
	});

	it("non-jsx file → null", () => {
		const plugin = createCssScopePlugin();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | null;

		const result = transform.call({}, '<div css="color: red">', "styles.css");
		expect(result).toBeNull();
	});

	it("has enforce: pre to run before Solid JSX transform", () => {
		const plugin = createCssScopePlugin();
		expect(plugin.enforce).toBe("pre");
	});

	it("injects registerCSSByName import when css= is transformed", () => {
		const plugin = createCssScopePlugin();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | null;
		const result = transform.call({}, '<div css="color: red">', "comp.tsx");
		expect(result?.code).toContain("import { registerCSSByName as __flare_registerCSSByName__ }");
		expect(result?.code).toContain("@lovrozagar/flare/styles");
	});

	it("does not duplicate import on multiple css= in same file", () => {
		const plugin = createCssScopePlugin();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | null;
		const code = '<div css="color: red" />\n<span css="padding: 1rem" />';
		const result = transform.call({}, code, "comp.tsx");
		const importCount = (result?.code.match(/__flare_registerCSSByName__.*from/g) ?? []).length;
		expect(importCount).toBe(1);
	});
});

describe("createCssScopePlugin — SVG elements", () => {
	it("css= on <svg> transforms identically to <div>", () => {
		const plugin = createCssScopePlugin();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | null;

		const svgResult = transform.call({}, '<svg css="stroke: red" viewBox="0 0 24 24" />', "icon.tsx");
		const divResult = transform.call({}, '<div css="stroke: red" />', "box.tsx");
		expect(svgResult?.code).toContain("data-c");
		expect(svgResult?.code).toContain("__flare_registerCSSByName__");
		const svgHash = svgResult?.code.match(/__flare_registerCSSByName__\("([^"]+)"/)?.[1];
		const divHash = divResult?.code.match(/__flare_registerCSSByName__\("([^"]+)"/)?.[1];
		expect(svgHash).toBe(divHash);
	});

	it("css= on SVG child elements (path, circle, line)", () => {
		const plugin = createCssScopePlugin();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | null;

		const code = '<path css="fill: blue" d="M0 0" />\n<circle css="stroke: green" cx="10" cy="10" r="5" />';
		const result = transform.call({}, code, "icon.tsx");
		expect(result?.code).toContain("data-c");
		expect(result?.code).toContain("fill: blue");
		expect(result?.code).toContain("stroke: green");
	});
});

describe("createCssScopePlugin — css= edge cases", () => {
	it("css= with multi-rule string", () => {
		const plugin = createCssScopePlugin();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | null;

		const result = transform.call({}, '<div css="color: red; font-size: 24px; padding: 16px">', "comp.tsx");
		expect(result?.code).toContain("data-c");
		expect(result?.code).toContain("color: red; font-size: 24px; padding: 16px");
	});

	it("css= with @media rule", () => {
		const plugin = createCssScopePlugin();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | null;

		const result = transform.call(
			{},
			'<div css="color: red; @media (min-width: 768px) { font-size: 2rem }">',
			"comp.tsx",
		);
		expect(result?.code).toContain("data-c");
		expect(result?.code).toContain("@media");
	});
});

describe("createServerFnPlugin", () => {
	it("returns plugin with name", () => {
		const plugin = createServerFnPlugin();
		expect(plugin.name).toBe("flare:server-fn");
	});

	it("injects __id into createServerFn calls (SSR)", () => {
		const plugin = createServerFnPlugin();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | null;

		const code = 'const myFn = createServerFn({ name: "myFn" })';
		const result = transform.call({ environment: { name: "ssr" } }, code, "src/api.ts");

		expect(result?.code).toContain("__id:");
		expect(result?.code).toContain("createServerFn");
	});

	it("no createServerFn → null", () => {
		const plugin = createServerFnPlugin();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | null;

		const result = transform.call({ environment: { name: "ssr" } }, 'const x = "hello"', "src/api.ts");
		expect(result).toBeNull();
	});

	it("deterministic IDs", () => {
		const plugin = createServerFnPlugin();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | null;

		const code = 'const myFn = createServerFn({ name: "myFn" })';
		const r1 = transform.call({ environment: { name: "ssr" } }, code, "src/api.ts");
		const r2 = transform.call({ environment: { name: "ssr" } }, code, "src/api.ts");
		expect(r1?.code).toBe(r2?.code);
	});

	it("virtual:flare-server-fn-secret resolves", () => {
		const plugin = createServerFnPlugin();
		const resolveId = plugin.resolveId as ((id: string) => string | null) | undefined;

		if (!resolveId) throw new Error("resolveId not found");

		expect(resolveId.call({ environment: { name: "ssr" } }, "virtual:flare-server-fn-secret")).toBe(
			"\0virtual:flare-server-fn-secret",
		);
	});

	it("load virtual:flare-server-fn-secret → hex string", () => {
		const plugin = createServerFnPlugin();
		const load = plugin.load as ((id: string) => { code: string; moduleType: string } | null) | undefined;

		if (!load) throw new Error("load not found");

		const result = load.call({}, "\0virtual:flare-server-fn-secret");
		expect(result?.moduleType).toBe("js");
		expect(result?.code).toContain("export default");
	});

	it("virtual:flare-server-fn-map resolves for SSR", () => {
		const plugin = createServerFnPlugin();
		const resolveId = plugin.resolveId as ((id: string) => string | null) | undefined;

		if (!resolveId) throw new Error("resolveId not found");

		const result = resolveId.call({ environment: { name: "ssr" } }, "virtual:flare-server-fn-map");
		expect(result).toBe("\0virtual:flare-server-fn-map");
	});

	it("virtual:flare-server-fn-map returns null for client env", () => {
		const plugin = createServerFnPlugin();
		const resolveId = plugin.resolveId as ((id: string) => string | null) | undefined;

		if (!resolveId) throw new Error("resolveId not found");

		const result = resolveId.call({ environment: { name: "client" } }, "virtual:flare-server-fn-map");
		expect(result).toBeNull();
	});

	it("handler stripping on client env", () => {
		const plugin = createServerFnPlugin();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | null;

		const code = [
			'const fn = createServerFn({ name: "test" })',
			"  .handler(async ({ input }) => {",
			"    const result = await db.query(input.id)",
			"    return processResult(result)",
			"  })",
		].join("\n");

		const result = transform.call({ environment: { name: "client" } }, code, "src/api.ts");
		expect(result?.code).toContain("Server function called on client");
		expect(result?.code).not.toContain("db.query");
		expect(result?.code).not.toContain("processResult");
	});

	it("handler preserved in SSR env", () => {
		const plugin = createServerFnPlugin();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | null;

		const code = [
			'const fn = createServerFn({ name: "test" })',
			"  .handler(async ({ input }) => {",
			"    return await db.query(input.id)",
			"  })",
		].join("\n");

		const result = transform.call({ environment: { name: "ssr" } }, code, "src/api.ts");
		expect(result?.code).toContain("db.query");
	});
});

describe("createCssTransformPlugin", () => {
	it("returns plugin with name", () => {
		const plugin = createCssTransformPlugin();
		expect(plugin.name).toBe("flare:css-transform");
	});

	it("transforms @theme → :root", () => {
		const plugin = createCssTransformPlugin();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | null;

		const result = transform.call({}, "@theme { --color-primary: #007bff; }", "styles.css");
		expect(result?.code).toContain(":root");
		expect(result?.code).not.toContain("@theme");
	});

	it("removes @layer", () => {
		const plugin = createCssTransformPlugin();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | null;

		const result = transform.call({}, "@layer base { body { margin: 0; } }", "styles.css");
		expect(result?.code).not.toContain("@layer");
		expect(result?.code).toContain("body");
	});

	it("@layer with nested rules preserves inner braces", () => {
		const plugin = createCssTransformPlugin();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | null;

		const css = "@layer base {\n  .card {\n    padding: 1rem;\n    .title { font-weight: bold; }\n  }\n}";
		const result = transform.call({}, css, "styles.css");
		expect(result?.code).not.toContain("@layer");
		expect(result?.code).toContain(".card");
		expect(result?.code).toContain(".title { font-weight: bold; }");
		/* Inner braces must be balanced */
		const opens = (result?.code.match(/{/g) ?? []).length;
		const closes = (result?.code.match(/}/g) ?? []).length;
		expect(opens).toBe(closes);
	});

	it("multiple @layer blocks both stripped correctly", () => {
		const plugin = createCssTransformPlugin();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | null;

		const css = "@layer base { body { margin: 0; } }\n@layer components { .btn { color: blue; } }";
		const result = transform.call({}, css, "styles.css");
		expect(result?.code).not.toContain("@layer");
		expect(result?.code).toContain("body { margin: 0; }");
		expect(result?.code).toContain(".btn { color: blue; }");
	});

	it("@layer with hyphenated name stripped", () => {
		const plugin = createCssTransformPlugin();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | null;

		const css = "@layer my-utilities { .flex { display: flex; } }";
		const result = transform.call({}, css, "styles.css");
		expect(result?.code).not.toContain("@layer");
		expect(result?.code).toContain(".flex { display: flex; }");
	});

	it("@layer with deeply nested braces", () => {
		const plugin = createCssTransformPlugin();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | null;

		const css = "@layer utils { @media (min-width: 768px) { .grid { display: grid; } } }";
		const result = transform.call({}, css, "styles.css");
		expect(result?.code).not.toContain("@layer");
		expect(result?.code).toContain("@media (min-width: 768px)");
		expect(result?.code).toContain(".grid { display: grid; }");
	});

	it("unnamed @layer stripped correctly", () => {
		const plugin = createCssTransformPlugin();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | null;

		const css = "@layer { .card { padding: 1rem; } }";
		const result = transform.call({}, css, "styles.css");
		expect(result?.code).not.toContain("@layer");
		expect(result?.code).toContain(".card { padding: 1rem; }");
	});

	it("unnamed @layer with nested content preserved", () => {
		const plugin = createCssTransformPlugin();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | null;

		const css = "@layer { @media (min-width: 768px) { .grid { display: grid; } } }";
		const result = transform.call({}, css, "styles.css");
		expect(result?.code).not.toContain("@layer");
		expect(result?.code).toContain("@media (min-width: 768px)");
		expect(result?.code).toContain(".grid { display: grid; }");
	});

	it("mixed named and unnamed @layer blocks both stripped", () => {
		const plugin = createCssTransformPlugin();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | null;

		const css = "@layer base { body { margin: 0; } }\n@layer { .card { padding: 1rem; } }";
		const result = transform.call({}, css, "styles.css");
		expect(result?.code).not.toContain("@layer");
		expect(result?.code).toContain("body { margin: 0; }");
		expect(result?.code).toContain(".card { padding: 1rem; }");
	});

	it("non-css file → null", () => {
		const plugin = createCssTransformPlugin();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | null;

		const result = transform.call({}, "@theme { --color: red; }", "file.ts");
		expect(result).toBeNull();
	});
});

describe("flare:dev-server auto-detection", () => {
	it("skips when middlewareMode is true", () => {
		const plugins = flarePlugins({});
		const devServer = plugins.find((p) => p.name === "flare:dev-server");
		const configureServer = devServer?.configureServer as ((server: unknown) => (() => void) | undefined) | undefined;

		if (!configureServer) throw new Error("configureServer not found");

		let middlewareInstalled = false;
		const mockServer = {
			config: { server: { middlewareMode: true } },
			environments: {
				ssr: { runner: { import: vi.fn<() => unknown>() } },
			},
			middlewares: {
				use: () => {
					middlewareInstalled = true;
				},
			},
			ssrFixStacktrace: vi.fn<() => unknown>(),
			transformIndexHtml: vi.fn<() => unknown>(),
		};

		const postHook = configureServer(mockServer);
		expect(postHook).toBeDefined();
		postHook?.();
		expect(middlewareInstalled).toBe(false);
	});

	it("skips when dispatchFetch present on ssr env (platform plugin)", () => {
		const plugins = flarePlugins({});
		const devServer = plugins.find((p) => p.name === "flare:dev-server");
		const configureServer = devServer?.configureServer as ((server: unknown) => (() => void) | undefined) | undefined;

		if (!configureServer) throw new Error("configureServer not found");

		let middlewareInstalled = false;
		const mockServer = {
			config: {},
			environments: {
				ssr: {
					dispatchFetch: vi.fn<() => unknown>(),
					runner: { import: vi.fn<() => unknown>() },
				},
			},
			middlewares: {
				use: () => {
					middlewareInstalled = true;
				},
			},
			ssrFixStacktrace: vi.fn<() => unknown>(),
			transformIndexHtml: vi.fn<() => unknown>(),
		};

		const postHook = configureServer(mockServer);
		expect(postHook).toBeDefined();
		postHook?.();
		expect(middlewareInstalled).toBe(false);
	});

	it("skips when no ssr environment exists", () => {
		const plugins = flarePlugins({});
		const devServer = plugins.find((p) => p.name === "flare:dev-server");
		const configureServer = devServer?.configureServer as ((server: unknown) => (() => void) | undefined) | undefined;

		if (!configureServer) throw new Error("configureServer not found");

		let middlewareInstalled = false;
		const mockServer = {
			config: {},
			environments: {},
			middlewares: {
				use: () => {
					middlewareInstalled = true;
				},
			},
			ssrFixStacktrace: vi.fn<() => unknown>(),
			transformIndexHtml: vi.fn<() => unknown>(),
		};

		const postHook = configureServer(mockServer);
		expect(postHook).toBeDefined();
		postHook?.();
		expect(middlewareInstalled).toBe(false);
	});

	it("installs middleware when no platform plugin detected", () => {
		const plugins = flarePlugins({});
		const devServer = plugins.find((p) => p.name === "flare:dev-server");
		const configureServer = devServer?.configureServer as ((server: unknown) => (() => void) | undefined) | undefined;

		if (!configureServer) throw new Error("configureServer not found");

		let middlewareInstalled = false;
		const mockServer = {
			config: {},
			environments: {
				ssr: { runner: { import: vi.fn<() => unknown>() } },
			},
			middlewares: {
				use: () => {
					middlewareInstalled = true;
				},
			},
			ssrFixStacktrace: vi.fn<() => unknown>(),
			transformIndexHtml: vi.fn<() => unknown>(),
		};

		const postHook = configureServer(mockServer);
		expect(postHook).toBeDefined();
		postHook?.();
		expect(middlewareInstalled).toBe(true);
	});
});

describe("flare — entry option", () => {
	it("entry.client override flows into flare:ssr-build client input", () => {
		const plugins = flarePlugins({ entry: { client: "src/custom.client.tsx" } });
		const ssrBuild = plugins.find((p) => p.name === "flare:ssr-build");
		const config = ssrBuild?.config as (() => Record<string, unknown>) | undefined;

		if (!config) throw new Error("config not found");

		const result = config.call({}) as {
			environments?: {
				client?: { build?: { rolldownOptions?: { input?: string } } };
			};
		};

		expect(result.environments?.client?.build?.rolldownOptions?.input).toBe("src/custom.client.tsx");
	});

	it("entry.server override flows into flare:ssr-build ssr input", () => {
		const plugins = flarePlugins({ entry: { server: "src/custom.server.ts" } });
		const ssrBuild = plugins.find((p) => p.name === "flare:ssr-build");
		const config = ssrBuild?.config as (() => Record<string, unknown>) | undefined;

		if (!config) throw new Error("config not found");

		const result = config.call({}) as {
			environments?: {
				ssr?: { build?: { rolldownOptions?: { input?: string } } };
			};
		};

		expect(result.environments?.ssr?.build?.rolldownOptions?.input).toBe("src/custom.server.ts");
	});

	it("convention still works when entry is omitted", () => {
		const plugins = flarePlugins({});
		const ssrBuild = plugins.find((p) => p.name === "flare:ssr-build");
		const config = ssrBuild?.config as (() => Record<string, unknown>) | undefined;

		if (!config) throw new Error("config not found");

		const result = config.call({}) as {
			environments?: {
				client?: { build?: { rolldownOptions?: { input?: string } } };
				ssr?: { build?: { rolldownOptions?: { input?: string } } };
			};
		};

		expect(result.environments?.client?.build?.rolldownOptions?.input).toBe("src/client.tsx");
		expect(result.environments?.ssr?.build?.rolldownOptions?.input).toBe("src/server.ts");
	});

	it("partial override — only entry.client", () => {
		const plugins = flarePlugins({ entry: { client: "src/custom.client.tsx" } });
		const ssrBuild = plugins.find((p) => p.name === "flare:ssr-build");
		const config = ssrBuild?.config as (() => Record<string, unknown>) | undefined;

		if (!config) throw new Error("config not found");

		const result = config.call({}) as {
			environments?: {
				client?: { build?: { rolldownOptions?: { input?: string } } };
				ssr?: { build?: { rolldownOptions?: { input?: string } } };
			};
		};

		expect(result.environments?.client?.build?.rolldownOptions?.input).toBe("src/custom.client.tsx");
		expect(result.environments?.ssr?.build?.rolldownOptions?.input).toBe("src/server.ts");
	});

	it("entry.client pointing at a missing file throws a clear error", () => {
		expect(() => flare({ entry: { client: "src/does-not-exist.tsx" } })).toThrow(/does-not-exist/);
	});

	it("flare:dev-prerender plugin receives entries", () => {
		const plugins = flarePlugins({ entry: { server: "src/custom.server.ts" } });
		const devPrerender = plugins.find((p) => p.name === "flare:dev-prerender");
		expect(devPrerender).toBeDefined();
	});
});

describe("Nitro integration — Vite environment compatibility", () => {
	it("ssr environment has build.rolldownOptions.input for Nitro service detection", () => {
		const plugins = flarePlugins({});
		const ssrBuild = plugins.find((p) => p.name === "flare:ssr-build");
		const config = ssrBuild?.config as (() => Record<string, unknown>) | undefined;

		if (!config) throw new Error("config not found");

		const result = config.call({}) as {
			environments?: {
				ssr?: { build?: { rolldownOptions?: { input?: string } } };
			};
		};

		/* Nitro reads rolldownOptions.input to auto-detect the SSR entry */
		expect(result.environments?.ssr?.build?.rolldownOptions?.input).toBeDefined();
		expect(typeof result.environments?.ssr?.build?.rolldownOptions?.input).toBe("string");
	});

	it("appType is 'custom' — compatible with Nitro overlay", () => {
		const plugins = flarePlugins({});
		const ssrBuild = plugins.find((p) => p.name === "flare:ssr-build");
		const config = ssrBuild?.config as (() => Record<string, unknown>) | undefined;

		if (!config) throw new Error("config not found");

		const result = config.call({}) as { appType?: string };
		expect(result.appType).toBe("custom");
	});

	it("builder.buildApp is overridable by post-order plugins", () => {
		const plugins = flarePlugins({});
		const ssrBuild = plugins.find((p) => p.name === "flare:ssr-build");
		const config = ssrBuild?.config as (() => Record<string, unknown>) | undefined;

		if (!config) throw new Error("config not found");

		const result = config.call({}) as {
			builder?: { buildApp?: unknown };
		};

		/* Flare defines buildApp; Nitro's post-order buildApp overrides it */
		expect(result.builder?.buildApp).toBeDefined();
		expect(typeof result.builder?.buildApp).toBe("function");
	});

	it("dev server resolves default export for non-platform setups", async () => {
		const plugins = flarePlugins({});
		const devServer = plugins.find((p) => p.name === "flare:dev-server");
		const configureServer = devServer?.configureServer as ((server: unknown) => (() => void) | undefined) | undefined;

		if (!configureServer) throw new Error("configureServer not found");

		const mockFetch = vi
			.fn<() => Promise<Response>>()
			.mockResolvedValue(new Response("ok", { headers: { "content-type": "text/plain" } }));
		const mockModule = {
			/* default export — as used in Nitro consumer examples */
			default: { fetch: mockFetch },
		};

		let installedHandler: ((req: unknown, res: unknown, next: unknown) => void) | undefined;
		const mockServer = {
			config: {},
			environments: {
				ssr: { runner: { import: vi.fn<() => unknown>().mockResolvedValue(mockModule) } },
			},
			middlewares: {
				use: (fn: (req: unknown, res: unknown, next: unknown) => void) => {
					installedHandler = fn;
				},
			},
			ssrFixStacktrace: vi.fn<() => unknown>(),
			transformIndexHtml: vi.fn<() => unknown>(),
		};

		const postHook = configureServer(mockServer);
		postHook?.();
		expect(installedHandler).toBeDefined();

		const mockRes = {
			end: vi.fn<() => unknown>(),
			writeHead: vi.fn<() => unknown>(),
		};
		const mockNext = vi.fn<() => unknown>();

		/* socket: {} required — dev server reads req.socket.encrypted to build URL */
		await installedHandler?.(
			{
				headers: { host: "localhost" },
				method: "GET",
				on: vi.fn<() => unknown>(),
				socket: {},
				url: "/",
			},
			mockRes,
			mockNext,
		);

		/* default export's fetch should be called */
		expect(mockFetch).toHaveBeenCalled();
	});

	it("dev server prefers named server export over default", async () => {
		const plugins = flarePlugins({});
		const devServer = plugins.find((p) => p.name === "flare:dev-server");
		const configureServer = devServer?.configureServer as ((server: unknown) => (() => void) | undefined) | undefined;

		if (!configureServer) throw new Error("configureServer not found");

		const namedFetch = vi
			.fn<() => Promise<Response>>()
			.mockResolvedValue(new Response("named", { headers: { "content-type": "text/plain" } }));
		const defaultFetch = vi
			.fn<() => Promise<Response>>()
			.mockResolvedValue(new Response("default", { headers: { "content-type": "text/plain" } }));
		const mockModule = {
			default: { fetch: defaultFetch },
			server: { fetch: namedFetch },
		};

		let installedHandler: ((req: unknown, res: unknown, next: unknown) => void) | undefined;
		const mockServer = {
			config: {},
			environments: {
				ssr: { runner: { import: vi.fn<() => unknown>().mockResolvedValue(mockModule) } },
			},
			middlewares: {
				use: (fn: (req: unknown, res: unknown, next: unknown) => void) => {
					installedHandler = fn;
				},
			},
			ssrFixStacktrace: vi.fn<() => unknown>(),
			transformIndexHtml: vi.fn<() => unknown>(),
		};

		const postHook = configureServer(mockServer);
		postHook?.();

		const mockRes = {
			end: vi.fn<() => unknown>(),
			writeHead: vi.fn<() => unknown>(),
		};

		/* socket: {} required — dev server reads req.socket.encrypted to build URL */
		await installedHandler?.(
			{
				headers: { host: "localhost" },
				method: "GET",
				on: vi.fn<() => unknown>(),
				socket: {},
				url: "/",
			},
			mockRes,
			vi.fn<() => unknown>(),
		);

		/* Named export takes priority */
		expect(namedFetch).toHaveBeenCalled();
		expect(defaultFetch).not.toHaveBeenCalled();
	});

	it("ssr environment output produces server.js entry — Nitro bundles this", () => {
		const plugins = flarePlugins({});
		const ssrBuild = plugins.find((p) => p.name === "flare:ssr-build");
		const config = ssrBuild?.config as (() => Record<string, unknown>) | undefined;

		if (!config) throw new Error("config not found");

		const result = config.call({}) as {
			environments?: {
				ssr?: {
					build?: {
						rolldownOptions?: {
							output?: { entryFileNames?: string };
						};
					};
				};
			};
		};

		expect(result.environments?.ssr?.build?.rolldownOptions?.output?.entryFileNames).toBe("server.js");
	});
});
