import { mkdtempSync, rmSync } from "node:fs";
import { createServer as createHttpServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit, type Browser, type BrowserType } from "@playwright/test";
import type * as solid from "solid-js";
import type * as web from "@solidjs/web";
import { createServer, isRunnableDevEnvironment, type Plugin, type ViteDevServer } from "vite";
import { browserEndpoint } from "../../../../scripts/browser-server.ts";
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
	const endpoint = await browserEndpoint();
	const browsers = new Map<Engine, Browser>();
	const browser = async (engine: Engine): Promise<Browser> => {
		const open =
			browsers.get(engine) ??
			(endpoint === undefined
				? await TYPES[engine].launch()
				: await TYPES[engine].connect(endpoint, { timeout: 60_000 }));
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
