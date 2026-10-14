import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer as createHttpServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { chromium, firefox, webkit, type Browser, type BrowserType } from "@playwright/test";
import type * as solid from "solid-js";
import type * as web from "@solidjs/web";
import { createServer, isRunnableDevEnvironment, type Plugin, type ViteDevServer } from "vite";
import type * as progress from "../../src/client/navigation/progress.ts";
import type * as outlet from "../../src/shared/components/outlet.tsx";
import type * as outletNodes from "../../src/shared/components/outlet-nodes.ts";
import type * as router from "../../src/shared/router/create-router.ts";
import type * as routerContext from "../../src/shared/router/context.ts";
import type * as page from "../../src/shared/route-builder/page.ts";
import type * as rootLayout from "../../src/shared/route-builder/root-layout.ts";

// What a tree builds from. Each side gets its own build of these modules: the server render the ones Vite's SSR
// runner loads (Solid's server build), the browser the ones Vite serves it (Solid's browser build).
export type Api = {
	solid: typeof solid;
	web: typeof web;
	progress: typeof progress;
	outlet: typeof outlet;
	outletNodes: typeof outletNodes;
	router: typeof router;
	routerContext: typeof routerContext;
	page: typeof page;
	rootLayout: typeof rootLayout;
	// An element with an id and lazy children, so a tree needs no JSX transform.
	h: (tag: string, id: string, children?: () => unknown) => web.JSX.Element;
};

export type Side = "server" | "client";

// A tree is compiled into each side as source, the way an app's one source builds twice, so it reads only `api`
// and `side`: a value it closes over does not exist in the browser.
export type Tree = (api: Api, side: Side) => web.JSX.Element;

export type Engine = "chromium" | "firefox" | "webkit";

export type Hydrated = { html: string; problems: string[]; text: string };

export type Harness = {
	hydrate: (engine: Engine, tree: Tree) => Promise<Hydrated>;
	close: () => Promise<void>;
};

export const ENGINES: readonly Engine[] = ["chromium", "firefox", "webkit"];

// Solid reports a failed hydration on the console: a tag mismatch, a key miss, unclaimed server nodes, a thrown
// mismatch, and the strict read check. Any of them is a problem.
const PROBLEM = /hydration|key miss|unclaimed|STRICT_READ_UNTRACKED/i;

const MODULES: Record<keyof Omit<Api, "solid" | "web" | "h">, string> = {
	progress: "/src/client/navigation/progress.ts",
	outlet: "/src/shared/components/outlet.tsx",
	outletNodes: "/src/shared/components/outlet-nodes.ts",
	router: "/src/shared/router/create-router.ts",
	routerContext: "/src/shared/router/context.ts",
	page: "/src/shared/route-builder/page.ts",
	rootLayout: "/src/shared/route-builder/root-layout.ts",
};

const CASE = "virtual:flare-hydrate/case-";
const CLIENT = "virtual:flare-hydrate/client-";

const TYPES: Record<Engine, BrowserType> = { chromium, firefox, webkit };

// One Vite and one HTTP server per test file, over packages/core, with one browser connection per engine. The Vite
// cache lives in a temp dir that close() removes.
export async function startHarness(core: string): Promise<Harness> {
	const cases = new Map<string, string>();
	const cacheDir = mkdtempSync(join(tmpdir(), "flare-hydrate-"));
	// The page's Vite client opens its socket on this server, the page's own origin. On Vite's default HMR port it would
	// reach whatever else listens there, and a foreign server closing it fails every case with a pageerror.
	const http = createHttpServer();
	const vite = await createServer({
		configFile: false,
		root: core,
		cacheDir,
		logLevel: "silent",
		appType: "custom",
		plugins: [casePlugin(cases)],
		server: { middlewareMode: true, hmr: { server: http }, watch: null },
		// The browser loads Solid's ES modules as they are, so no prebundle can reload a page mid-case.
		optimizeDeps: { noDiscovery: true, include: [] },
		// Vite's runner evaluates every dependency itself, so the server side resolves one consistent Solid build.
		ssr: { noExternal: true },
	});
	await listen(http, vite, cases);
	const origin = `http://127.0.0.1:${portOf(http)}`;
	const source = await browserSource();
	const browsers = new Map<Engine, Browser>();
	const browser = async (engine: Engine): Promise<Browser> => {
		const open =
			browsers.get(engine) ??
			(source.endpoint === undefined
				? await TYPES[engine].launch()
				: await TYPES[engine].connect(source.endpoint, { timeout: 60_000 }));
		browsers.set(engine, open);
		return open;
	};
	return {
		hydrate: (engine, tree) => hydrateIn({ cases, origin, browser: () => browser(engine) }, tree),
		async close() {
			for (const open of browsers.values()) await open.close();
			await new Promise((resolve) => http.close(resolve));
			await vite.close();
			rmSync(cacheDir, { recursive: true, force: true });
		},
	};
}

// A case's tree as a module, and the client entry that hydrates it. The tree's source is the test's function text.
function casePlugin(cases: Map<string, string>): Plugin {
	return {
		name: "flare-hydrate-cases",
		resolveId: (id) => (id.startsWith(CASE) || id.startsWith(CLIENT) ? `\0${id}` : undefined),
		load(id) {
			if (id.startsWith(`\0${CASE}`)) return caseModule(cases.get(id.slice(CASE.length + 1)) ?? "undefined");
			if (id.startsWith(`\0${CLIENT}`)) return clientModule(id.slice(CLIENT.length + 1));
			return undefined;
		},
	};
}

function caseModule(source: string): string {
	const imports = Object.entries(MODULES).map(([name, path]) => `import * as ${name} from ${JSON.stringify(path)};`);
	return [
		`import * as solid from "solid-js";`,
		`import * as web from "@solidjs/web";`,
		...imports,
		`const h = (tag, id, children) => solid.createComponent(web.Dynamic, { component: tag, id, get children() { return children?.(); } });`,
		`export const api = { solid, web, h, ${Object.keys(MODULES).join(", ")} };`,
		`export const tree = ${source};`,
	].join("\n");
}

// The page hydrates its host and marks the window, so the harness knows the client finished. A hydrate that throws,
// as a hydration mismatch does, is reported on the console with the other problems.
function clientModule(id: string): string {
	return [
		`import { api, tree } from ${JSON.stringify(`${CASE}${id}`)};`,
		`try {`,
		`	api.web.hydrate(() => tree(api, "client"), document.getElementById("host"));`,
		`	api.solid.flush();`,
		`} catch (error) {`,
		`	console.error(String(error));`,
		`} finally {`,
		`	window.__flareHydrated = true;`,
		`}`,
	].join("\n");
}

async function listen(http: Server, vite: ViteDevServer, cases: Map<string, string>): Promise<void> {
	http.on("request", (req, res) => {
		const id = /^\/case\/(\w+)$/.exec(req.url ?? "")?.[1];
		if (id === undefined || !cases.has(id)) return vite.middlewares(req, res);
		void documentOf(vite, id).then(
			(body) => {
				res.writeHead(200, { "content-type": "text/html" });
				res.end(body);
			},
			(error: unknown) => {
				res.writeHead(500);
				res.end(String(error));
			},
		);
	});
	await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
}

function portOf(http: Server): number {
	const address = http.address();
	if (address === null || typeof address === "string") throw new Error("the harness server has no port");
	return address.port;
}

// The server render of a case, in a document with Solid's hydration script and the client entry.
async function documentOf(vite: ViteDevServer, id: string): Promise<string> {
	const ssr = vite.environments.ssr;
	if (!isRunnableDevEnvironment(ssr)) throw new Error("the SSR environment cannot run modules");
	const loaded: { api: Api; tree: Tree } = await ssr.runner.import(`${CASE}${id}`);
	const html = loaded.api.web.renderToString(() => loaded.tree(loaded.api, "server"));
	const script = loaded.api.web.generateHydrationScript();
	return `<!doctype html><html><head>${script}</head><body><div id="host">${html}</div><script type="module" src="/@id/${CLIENT}${id}"></script></body></html>`;
}

async function hydrateIn(
	at: { cases: Map<string, string>; origin: string; browser: () => Promise<Browser> },
	tree: Tree,
): Promise<Hydrated> {
	const id = `c${at.cases.size + 1}`;
	at.cases.set(id, tree.toString());
	const context = await (await at.browser()).newContext();
	try {
		const tab = await context.newPage();
		const problems: string[] = [];
		// Everything the page said, so a client that never finishes reports why.
		const seen: string[] = [];
		tab.on("console", (message) => {
			seen.push(`${message.type()}: ${message.text()}`);
			if (PROBLEM.test(message.text())) problems.push(message.text());
		});
		tab.on("pageerror", (error) => {
			seen.push(`pageerror: ${error.message}`);
			problems.push(`pageerror: ${error.message}`);
		});
		tab.on("requestfailed", (request) => void seen.push(`failed: ${request.url()} ${request.failure()?.errorText}`));
		tab.on("response", (answer) => {
			if (answer.status() >= 400) seen.push(`${answer.status()}: ${answer.url()}`);
		});
		const response = await tab.goto(`${at.origin}/case/${id}`);
		const html = (await response?.text()) ?? "";
		await tab
			.waitForFunction(() => Reflect.get(globalThis, "__flareHydrated") === true, undefined, { timeout: 10_000 })
			.catch((error: unknown) => {
				throw new Error(`the client did not hydrate: ${String(error)}\n${seen.join("\n")}`);
			});
		const text = (await tab.locator("#host").textContent()) ?? "";
		return { html, problems, text };
	} finally {
		await context.close();
	}
}

// The pinned image every machine runs the browsers from (B70). Its tag is the lockfile's Playwright version, and an
// upgrade changes the digest with it.
const DIGEST = "5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48";
const PORT = 3333;
const CONTAINER = "flare-browsers";

// Where the engines come from (bits/15): `FLARE_BROWSER_WS`, else the pinned container when Docker is present, else
// Playwright's locally installed engines, as on the macOS runners, which have no Docker. With none of the three, one
// error names all three.
async function browserSource(): Promise<{ endpoint: string | undefined }> {
	const set = process.env["FLARE_BROWSER_WS"];
	if (set !== undefined) return { endpoint: set };
	if (spawnSync(dockerBin(), ["--version"]).error === undefined) return { endpoint: await browserServer() };
	if (ENGINES.every((engine) => existsSync(TYPES[engine].executablePath()))) return { endpoint: undefined };
	throw new Error(
		"The hydrate harness has no browsers: set FLARE_BROWSER_WS to a Playwright run-server, install Docker for the " +
			"pinned container, or install Playwright's engines (bunx playwright install chromium firefox webkit)",
	);
}

function dockerBin(): string {
	return process.env["FLARE_DOCKER"] ?? "docker";
}

// A run-server on 127.0.0.1, started from the pinned image with host networking, or the one already running. The
// server is the lockfile's own playwright-core, mounted read-only, so the container downloads nothing and its version
// is the one the image's browsers were built for.
async function browserServer(): Promise<string> {
	const endpoint = `ws://127.0.0.1:${PORT}/`;
	if (await reachable(PORT)) return endpoint;
	const core = playwrightCore();
	const image = `mcr.microsoft.com/playwright:v${core.version}-noble@sha256:${DIGEST}`;
	const docker = dockerBin();
	const run = ["run", "-d", "--rm", "--init", "--network", "host", "--name", CONTAINER];
	const mount = ["-v", `${core.dir}:/playwright-core:ro`, image];
	const serve = ["node", "/playwright-core/cli.js", "run-server", "--port", String(PORT), "--host", "127.0.0.1"];
	const started = spawnSync(docker, [...run, ...mount, ...serve], { encoding: "utf8" });
	if (started.status !== 0 && !(started.stderr ?? "").includes("already in use")) {
		throw new Error(`the browser container did not start (${docker}): ${started.stderr || String(started.error)}`);
	}
	for (let waited = 0; waited < 120; waited += 1) {
		if (await reachable(PORT)) return endpoint;
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(`the browser run-server did not answer on ${endpoint}`);
}

// The playwright-core @playwright/test resolves, and its version.
function playwrightCore(): { dir: string; version: string } {
	const test = createRequire(import.meta.url).resolve("@playwright/test/package.json");
	const manifest = createRequire(test).resolve("playwright-core/package.json");
	const version = Reflect.get(Object(JSON.parse(readFileSync(manifest, "utf8"))), "version");
	if (typeof version !== "string") throw new Error("playwright-core has no version");
	return { dir: dirname(manifest), version };
}

function reachable(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = connect(port, "127.0.0.1");
		socket.once("connect", () => {
			socket.destroy();
			resolve(true);
		});
		socket.once("error", () => resolve(false));
	});
}
