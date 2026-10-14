import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { createServer } from "vite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import solid from "@solidjs/vite-plugin";
import { expect, it, vi } from "vitest";
import { fnId } from "../route-meta/index.ts";
import { buildIdOf } from "./build-id.ts";
import { flare } from "./flare.ts";
import type { FlareOptions } from "./options.ts";

// The options of a flare() that composes no Cloudflare plugin, so it returns its own plugins (B95).
type OwnOptions = Omit<FlareOptions, "workersDev">;

vi.mock("@solidjs/vite-plugin", () => ({
	default: vi.fn<() => Array<{ name: string }>>(() => [{ name: "solid" }]),
}));

function project(): string {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "flare-plugin-")));
	mkdirSync(join(root, "src"));
	writeFileSync(join(root, "src/client.tsx"), "");
	writeFileSync(join(root, "src/server.ts"), "");
	return root;
}

function apply(config: { root?: string; server?: { host?: string | boolean } }, options?: OwnOptions): void {
	const plugin = flare(options).find((item) => item.name === "flare");
	const hook = plugin?.config;
	if (typeof hook !== "function") throw new Error("config");
	hook.call(null as never, config as never, { command: "serve", mode: "development" } as never);
}

it("entry", () => {
	const root = project();
	try {
		expect(() => apply({ root })).not.toThrow();
		expect(() => apply({})).toThrow("entry.client src/client.tsx");
		rmSync(join(root, "src/client.tsx"));
		expect(() => apply({ root })).toThrow("entry.client src/client.tsx");
		writeFileSync(join(root, "src/client.tsx"), "");
		rmSync(join(root, "src/server.ts"));
		expect(() => apply({ root })).toThrow("entry.server src/server.ts");
		writeFileSync(join(root, "src/server.ts"), "");
		expect(() => apply({ root }, { entry: { client: "/tmp/client.tsx" } })).toThrow(/^entry\.client$/);
		expect(() => apply({ root }, { entry: { server: "/tmp/server.ts" } })).toThrow(/^entry\.server$/);
		expect(() => apply({ root }, { entry: { client: "src/missing.tsx" } })).toThrow("entry.client src/missing.tsx");
		expect(() => apply({ root }, { entry: { server: "src/missing.ts" } })).toThrow("entry.server src/missing.ts");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

it("host", () => {
	const root = project();
	try {
		expect(() => apply({ root, server: { host: true } })).toThrow(/^true$/);
		expect(() => apply({ root, server: { host: "0.0.0.0" } })).toThrow("0.0.0.0");
		expect(() => apply({ root, server: { host: "::" } })).toThrow(/^::$/);
		expect(() => apply({ root })).not.toThrow();
		expect(() => apply({ root, server: { host: "localhost" } })).not.toThrow();
		expect(() => apply({ root, server: { host: "127.0.0.1" } })).not.toThrow();
		expect(() => apply({ root, server: { host: "::1" } })).not.toThrow();
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

it("solid options", () => {
	flare();
	expect(vi.mocked(solid)).toHaveBeenCalledWith({ ssr: true, extensions: [".tsx", ".jsx"] });
});

const BUILD_INFO = fileURLToPath(new URL("../../server/lifecycle/build-info.ts", import.meta.url));

function flarePlugin(options?: OwnOptions) {
	const plugin = flare(options).find((item) => item.name === "flare");
	if (plugin === undefined) throw new Error("plugin");
	return plugin;
}

// The plugin's config hook for this root, then its load hook as the named environment would call it.
// The core plugin's server hook, which runs first among the plugins' (`order: "pre"`, B95 (b)).
function serverHook(plugin: ReturnType<typeof flarePlugin>): (...args: unknown[]) => unknown {
	const hook: unknown = plugin.configureServer;
	const handler: unknown = typeof hook === "object" && hook !== null ? Reflect.get(hook, "handler") : hook;
	if (typeof handler !== "function") throw new Error("configureServer");
	return (...args) => Reflect.apply(handler, null, args);
}

function loader(plugin: ReturnType<typeof flarePlugin>, root: string) {
	const config = plugin.config;
	if (typeof config !== "function") throw new Error("config");
	const returned = config.call(null as never, { root } as never, { command: "build", mode: "production" } as never);
	const load = plugin.load;
	if (typeof load !== "function") throw new Error("load");
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
			};
			serverHook(plugin)(server);
		},
	};
}

// The server environments load build-info.ts as the dev entry in serve and as the client build's id and hashed entry in
// a build, after the client wrote its manifest. No define is set.
it("client entry define", async () => {
	const root = project();
	try {
		const { returned, load, start } = loader(flarePlugin(), root);
		start("<meta name=x>");
		expect(returned).toMatchObject({
			appType: "custom",
			resolve: { dedupe: ["solid-js", "@solidjs/web"] },
			ssr: { noExternal: ["solid-js", "@solidjs/web", "@lovrozagar/flare", "@tanstack/solid-query"] },
			optimizeDeps: { exclude: ["@lovrozagar/flare"] },
		});
		expect(returned).not.toHaveProperty("define");
		expect(flarePlugin().configEnvironment).toBeUndefined();
		const head = '\nexport const devHead = "<meta name=x>";\n';
		const dev = `export const buildId = "dev";\nexport const clientEntry = "/src/client.tsx";${head}`;
		expect(await load("ssr", "serve")).toBe(dev);
		expect(await load("worker", "serve")).toBe(dev);
		expect(load("client", "serve")).toBeNull();
		expect(load("ssr", "serve", join(root, "src/other.ts"))).toBeNull();
		writeFileSync(join(root, "src/entry.tsx"), "");
		const other = loader(flarePlugin({ entry: { client: "src/entry.tsx" } }), root);
		other.start("<meta name=x>");
		expect(await other.load("ssr", "serve")).toBe(
			`export const buildId = "dev";\nexport const clientEntry = "/src/entry.tsx";${head}`,
		);
		const manifest = join(root, "dist/client/.vite/manifest.json");
		expect(() => load("ssr", "build")).toThrow(manifest);
		mkdirSync(join(root, "dist/client/.vite"), { recursive: true });
		writeFileSync(manifest, JSON.stringify({ "src/client.tsx": { file: "assets/client-a1.js" } }));
		expect(load("ssr", "build")).toBe(
			`export const buildId = "${buildIdOf({ "src/client.tsx": { file: "assets/client-a1.js" } })}";\nexport const clientEntry = "/assets/client-a1.js";\nexport const devHead = "";\n`,
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

it("dev server", () => {
	expect(flarePlugin().configureServer).toMatchObject({ order: "pre" });
	const hook = { call: (_self: unknown, server: unknown) => serverHook(flarePlugin())(server) };
	const used: unknown[] = [];
	const server = (middlewareMode: boolean) => ({
		config: { root: "/app", server: { middlewareMode }, logger: { error: () => undefined } },
		watcher: { on: () => undefined },
		middlewares: { use: (handler: unknown) => void used.push(handler) },
		transformIndexHtml: async (_url: string, html: string) => html,
		ws: { send: () => undefined },
		environments: { ssr: { hot: { on: () => undefined } }, client: { hot: { on: () => undefined } } },
	});
	expect(hook.call(null as never, server(true) as never)).toBeUndefined();
	const post = hook.call(null as never, server(false) as never);
	expect(typeof post).toBe("function");
});

// The map carries the original source, so only the code is checked.
function code(result: unknown): string {
	const text: unknown = typeof result === "object" && result !== null ? Reflect.get(result, "code") : undefined;
	if (typeof text !== "string") throw new Error("the module was not transformed");
	return text;
}

it("boundary transform", () => {
	const plugin = flare().find((item) => item.name === "flare:boundary");
	expect(plugin?.enforce).toBe("pre");
	const hook = plugin?.transform;
	if (typeof hook !== "function") throw new Error("transform");
	const root = "/app";
	const run = (name: string, id: string, code: string): unknown =>
		Reflect.apply(hook, { environment: { name, config: { root } } }, [code, id]);
	const source =
		'import { createServerOnlyFn } from "@lovrozagar/flare";\nexport const read = createServerOnlyFn(() => SECRET);\n';
	expect(code(run("client", "/app/src/lib/read.ts", source))).not.toContain("SECRET");
	expect(run("ssr", "/app/src/lib/read.ts", source)).toBeNull();
	expect(run("worker", "/app/src/lib/read.ts", source)).toBeNull();
	// The id hashes the root-relative path.
	const fn =
		'import { createServerFn } from "@lovrozagar/flare/server-fn";\nexport const echo = createServerFn().handler(h);\n';
	expect(code(run("ssr", "/app/src/fns/echo.ts", fn))).toContain(`__id: "${fnId("src/fns/echo.ts", "echo")}"`);
	// Vite's own queries leave the module the module. Any other asks for something else.
	expect(code(run("client", "/app/src/lib/read.ts?v=abc123", source))).not.toContain("SECRET");
	expect(code(run("client", "/app/src/lib/read.ts?import&t=1", source))).not.toContain("SECRET");
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
		expect(run("client", id, source)).toBeNull();
	}
	expect(run("client", "/app/src/plain.ts", "export const a = 1;\n")).toBeNull();
});

it("hmr keeps split", async () => {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "flare-hmr-")));
	mkdirSync(join(root, "src"));
	writeFileSync(join(root, "flare-stub.ts"), "export const createPage = (id: string) => ({ id });\n");
	const file = join(root, "src/a.page.ts");
	const source =
		'import { createPage } from "@lovrozagar/flare";\nexport const route = createPage("_root_/a").loader(() => "LOADER_BODY").render(() => "page");\n';
	writeFileSync(file, source);
	const boundary = flare().find((item) => item.name === "flare:boundary");
	const server = await createServer({
		root,
		configFile: false,
		logLevel: "silent",
		plugins: boundary === undefined ? [] : [boundary],
		resolve: { alias: { "@lovrozagar/flare": join(root, "flare-stub.ts") } },
		server: { middlewareMode: true, hmr: false, ws: false },
	});
	try {
		const client = server.environments.client;
		expect((await client.transformRequest("/src/a.page.ts"))?.code).not.toContain("LOADER_BODY");
		// An edit, then the re-request a hot update makes.
		writeFileSync(file, source.replace("LOADER_BODY", "LOADER_EDIT"));
		const changed = await client.moduleGraph.getModuleByUrl("/src/a.page.ts");
		if (changed !== undefined) client.moduleGraph.invalidateModule(changed);
		const hot = (await client.transformRequest("/src/a.page.ts?t=1700000000000"))?.code ?? "";
		expect(hot).toContain('createPage("_root_/a").render(');
		expect(hot).not.toContain("LOADER_EDIT");
		expect((await client.transformRequest("/src/a.page.ts?v=abc123"))?.code).not.toContain("LOADER_EDIT");
	} finally {
		await server.close();
		rmSync(root, { recursive: true, force: true });
	}
}, 30_000);

// Whether this runtime's node:module has registerHooks, which the Cloudflare plugin needs (B95).
const HOOKS = typeof Reflect.get(nodeModule, "registerHooks") === "function";

// The plugin names `flare({ workersDev: true })` composes, the Cloudflare one first, or the error it throws.
async function workersDevNames(): Promise<unknown[]> {
	try {
		const [first, ...rest] = flare({ workersDev: true });
		return [names((await first) as unknown[])[0], ...names(rest)];
	} catch (error) {
		return [/Node 22\.15 or later/.exec(String(error))?.[0]];
	}
}

// Each plugin's name, whatever the option's element type.
function names(plugins: readonly unknown[]): unknown[] {
	return plugins.map((plugin) => Reflect.get(Object(plugin), "name"));
}

// `workersDev: true` composes the Cloudflare plugins before flare's own. `false` or absent composes none (B95). A
// runtime without node:module's registerHooks, such as the Bun run, gets the error instead of the composition.
it("workers dev", async () => {
	const composed = await workersDevNames();
	expect(composed).toEqual(HOOKS ? ["vite-plugin-cloudflare", ...names(flare())] : ["Node 22.15 or later"]);
	expect(names(flare({ workersDev: false }))).toEqual(names(flare()));
});

// Without the peer, flare({ workersDev: true }) throws when the plugin is created and names the install (B95).
it("workers dev missing peer", async () => {
	vi.resetModules();
	vi.doMock("./workers-dev.ts", async (original) => {
		const actual = await original<typeof import("./workers-dev.ts")>();
		const missing = {
			resolve: (): string => {
				throw new Error("ERR_MODULE_NOT_FOUND");
			},
			load: async () => ({}),
			hooks: () => true,
		};
		return { ...actual, workersDevPlugins: (entry: string) => actual.workersDevPlugins(entry, missing) };
	});
	try {
		const fresh = await import("./flare.ts");
		expect(() => fresh.flare({ workersDev: true })).toThrow("npm install -D @cloudflare/vite-plugin");
	} finally {
		vi.doUnmock("./workers-dev.ts");
		vi.resetModules();
	}
});
