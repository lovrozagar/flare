import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBuilder } from "vite";
import { afterEach, expect, it } from "vitest";
import { checkCloudflare, composesCloudflare, WORKER_MAIN } from "./cloudflare.ts";
import { flare } from "./flare.ts";

const plugin = (name: string) => ({ name });

// The app composes Cloudflare's plugin itself, beside flare() and in either order (B109). Flare finds it by name in
// the plugins option, nested arrays included, as `cloudflare()` returns one.
it("cloudflare composed", () => {
	const cloudflare = [plugin("vite-plugin-cloudflare:config"), plugin("vite-plugin-cloudflare")];
	expect(composesCloudflare([cloudflare, [plugin("flare")]])).toBe(true);
	expect(composesCloudflare([[plugin("flare")], cloudflare])).toBe(true);
	expect(composesCloudflare([plugin("flare"), false, null, undefined, [[plugin("solid")]]])).toBe(false);
	expect(composesCloudflare(undefined)).toBe(false);
});

// The plugin must run the worker in the ssr environment, whose resolve conditions then hold `workerd`, and the
// Wrangler `main` must be flare's worker entry. Anything else stops the dev server and the build with the fix, never a
// silent fall back to Node (BUGS.md 76).
it("cloudflare checked", () => {
	const ssr = ["workerd", "worker", "module"];
	expect(() => checkCloudflare({ conditions: ssr, main: WORKER_MAIN })).not.toThrow();
	expect(() => checkCloudflare({ conditions: ["module", "node"], main: WORKER_MAIN })).toThrow(
		'The Cloudflare plugin must run in the ssr environment: cloudflare({ viteEnvironment: { name: "ssr" } })',
	);
	expect(() => checkCloudflare({ conditions: ssr, main: "./src/worker.ts" })).toThrow(
		'The Wrangler config\'s main must be "@lovrozagar/flare/worker" (it is "./src/worker.ts")',
	);
	expect(() => checkCloudflare({ conditions: ssr, main: undefined })).toThrow(
		'The Wrangler config\'s main must be "@lovrozagar/flare/worker" (it has none)',
	);
});

// A fresh app under the repo's node_modules, so its imports of the package and the plugin resolve as an app's would.
const FIXTURES = fileURLToPath(new URL("../../../../../node_modules/.flare-fixtures/", import.meta.url));
const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const SERVER = [
	'import { createServer } from "@lovrozagar/flare/server";',
	'import { createRouter } from "@lovrozagar/flare";',
	"export const server = createServer({ router: createRouter({ layouts: {}, routeTree: [] }) });",
	"",
].join("\n");

function app(wrangler: string): string {
	mkdirSync(FIXTURES, { recursive: true });
	const root = realpathSync(mkdtempSync(join(FIXTURES, "cloudflare-")));
	roots.push(root);
	mkdirSync(join(root, "src"));
	writeFileSync(join(root, "src/client.tsx"), "");
	writeFileSync(join(root, "src/server.ts"), SERVER);
	writeFileSync(join(root, "wrangler.jsonc"), wrangler);
	return root;
}

// The core plugin's hooks over one app, after its config hook ran with `plugins` as the app lists them.
function core(root: string, plugins: unknown[]) {
	const found = flare().find((item) => item.name === "flare");
	if (found === undefined) throw new Error("flare");
	const hook = (name: "config" | "configResolved" | "configureServer"): ((...args: unknown[]) => unknown) => {
		const value: unknown = Reflect.get(found, name);
		const handler: unknown = typeof value === "object" && value !== null ? Reflect.get(value, "handler") : value;
		if (typeof handler !== "function") throw new Error(name);
		return (...args) => Reflect.apply(handler, null, args);
	};
	hook("config")({ root, plugins }, { command: "serve", mode: "development" });
	return hook;
}

const MAIN = '{ "name": "app", "main": "@lovrozagar/flare/worker", "compatibility_date": "2026-07-01" }\n';

// With the plugin, workerd answers every request through its post middleware, so flare's server hook, which runs
// first, installs no Node listener that would answer before it (BUGS.md 76). The resolved config is checked: the plugin
// on ssr, and seen when the config hook ran.
it("plugin present", () => {
	const root = app(MAIN);
	const cloudflare = [plugin("vite-plugin-cloudflare")];
	const hook = core(root, [cloudflare]);
	const used: unknown[] = [];
	const hot = { on: () => undefined };
	const server = {
		config: { root, server: { middlewareMode: false }, logger: { error: () => undefined } },
		watcher: { on: () => undefined },
		middlewares: { use: (handler: unknown) => void used.push(handler) },
		transformIndexHtml: async (_url: string, html: string) => html,
		environments: { ssr: { hot }, client: { hot } },
	};
	expect(hook("configureServer")(server)).toBeUndefined();
	expect(used).toEqual([]);
	const resolved = (conditions: string[], plugins: unknown[] = cloudflare) => ({
		base: "/",
		root,
		plugins,
		environments: { ssr: { resolve: { conditions } } },
	});
	expect(() => hook("configResolved")(resolved(["workerd", "module"]))).not.toThrow();
	expect(() => hook("configResolved")(resolved(["module", "node"]))).toThrow("must run in the ssr environment");
	expect(() => hook("configResolved")({ base: "/", root, plugins: cloudflare, environments: {} })).toThrow(
		"must run in the ssr environment",
	);
	expect(() => core(root, [])("configResolved")(resolved(["workerd"]))).toThrow(
		"flare() did not see the Cloudflare plugin",
	);
});

// A plugin hook called with no context, as the entry's hooks need none.
function call(hook: unknown, args: unknown[]): unknown {
	return Reflect.apply(Object(hook), {}, args);
}

// Under the plugin, the Wrangler main resolves to the app's server behind createWorkersHandler, forwarding to the
// assets binding the config names. Without the plugin the specifier is left to the package, whose file throws.
it("worker entry", async () => {
	const root = app(
		'{ "main": "@lovrozagar/flare/worker", "assets": { "binding": "ASSETS", "directory": "dist/client" } }',
	);
	const plugins = flare();
	const entry = plugins.find((item) => item.name === "flare:worker-entry");
	const config = plugins.find((item) => item.name === "flare")?.config;
	if (entry === undefined || typeof config !== "function") throw new Error("flare");
	expect(call(entry.resolveId, [WORKER_MAIN])).toBeNull();
	const env = { command: "build", mode: "production" };
	await Reflect.apply(config, {}, [{ root, plugins: [plugin("vite-plugin-cloudflare")] }, env]);
	const id = call(entry.resolveId, [WORKER_MAIN]);
	expect(id).toEqual(expect.any(String));
	expect(String(call(entry.load, [id]))).toContain('createWorkersHandler(server, { assets: "ASSETS" })');
	expect(call(entry.load, ["/app/src/other.ts"])).toBeNull();
});

// A real run with the plugin on ssr: the ssr output is the Workers bundle with the plugin's deploy config beside it,
// at `<outDir>/server/wrangler.json`, which the e2e boot runs (B109). Flare makes no worker environment of its own, and
// prerender's Node copy of the server is deleted once the seeds are written. The plugin needs node:module's
// registerHooks, so the Bun run skips this.
it.skipIf(typeof Reflect.get(nodeModule, "registerHooks") !== "function")(
	"workers output",
	async () => {
		const root = app(MAIN);
		const { cloudflare } = await import("@cloudflare/vite-plugin");
		const wrote: string[] = [];
		const spy = {
			name: "spy",
			writeBundle(this: { environment: { name: string } }) {
				wrote.push(this.environment.name);
			},
		};
		const builder = await createBuilder({
			root,
			configFile: false,
			logLevel: "silent",
			plugins: [
				cloudflare({ viteEnvironment: { name: "ssr" }, inspectorPort: false, persistState: false }),
				flare({ prerender: true }),
				spy,
			],
		});
		await builder.buildApp();
		expect(wrote).toEqual(["client", "ssr", "flare_prerender"]);
		const out = join(root, "dist");
		const deploy: unknown = JSON.parse(readFileSync(join(out, "server/wrangler.json"), "utf8"));
		const main = String(Reflect.get(Object(deploy), "main"));
		expect(readFileSync(join(out, "server", main), "utf8")).toContain("fetch");
		expect(existsSync(join(out, "worker"))).toBe(false);
		expect(existsSync(join(out, "prerender"))).toBe(false);
	},
	120_000,
);
