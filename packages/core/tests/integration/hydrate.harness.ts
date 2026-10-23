import { mkdtempSync, rmSync } from "node:fs"
import { createServer as createHttpServer, type IncomingMessage, type Server } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chromium, firefox, webkit, type Browser, type BrowserType } from "@playwright/test"
import { createServer, isRunnableDevEnvironment, type Plugin, type ViteDevServer } from "vite"
import { browserEndpoint } from "../../../../scripts/browser-server.ts"
import {
	APP,
	APP_CLIENT,
	appClientModule,
	appDocument,
	answerStyles,
	appIn,
	appModule,
	isAppRequest,
	type AppCase,
	type AppResult,
	primeApp,
} from "./hydrate.app.ts"
import { MODULES, type Api, type Side, type Tree } from "./hydrate.api.ts"
import { serverTimeline, type ServerTimeline } from "./hydrate.timeline.ts"

export type { Api, Side, Tree }

export type Engine = "chromium" | "firefox" | "webkit"

export type Hydrated = { html: string; problems: string[]; text: string }

export type Harness = {
	hydrate: (engine: Engine, tree: Tree) => Promise<Hydrated>
	// A real document `createServer(...).fetch` serves, hydrated by the real `createClient` (hydrate.app.ts).
	app: (engine: Engine, input: AppCase) => Promise<AppResult>
	close: () => Promise<void>
}

export type { AppCase, AppResult }

// The app cases by id, and the one the page's requests go to now.
type Apps = { cases: Map<string, AppCase>; active: string | undefined }

export const ENGINES: readonly Engine[] = ["chromium", "firefox", "webkit"]

// Solid reports a failed hydration on the console: a tag mismatch, a key miss, unclaimed server nodes, a thrown
// mismatch, and the strict read check. Any of them is a problem.
const PROBLEM = /hydration|key miss|unclaimed|STRICT_READ_UNTRACKED/i

const CASE = "virtual:flare-hydrate/case-"
const CLIENT = "virtual:flare-hydrate/client-"

const TYPES: Record<Engine, BrowserType> = { chromium, firefox, webkit }

// One Vite and one HTTP server per test file, over packages/core, with one browser connection per engine. The Vite
// cache lives in a temp dir that close() removes.
export async function startHarness(core: string): Promise<Harness> {
	const cases = new Map<string, string>()
	const apps: Apps = { cases: new Map(), active: undefined }
	const cacheDir = mkdtempSync(join(tmpdir(), "flare-hydrate-"))
	// The page's Vite client opens its socket on this server, the page's own origin. On Vite's default HMR port it would
	// reach whatever else listens there, and a foreign server closing it fails every case with a pageerror.
	const http = createHttpServer()
	const vite = await createServer({
		configFile: false,
		root: core,
		cacheDir,
		logLevel: "silent",
		appType: "custom",
		plugins: [casePlugin(cases, apps)],
		server: { middlewareMode: true, hmr: { server: http }, watch: null },
		// The browser loads Solid's ES modules as they are, so no prebundle can reload a page mid-case.
		optimizeDeps: { noDiscovery: true, include: [] },
		// Vite's runner evaluates every dependency itself, so the server side resolves one consistent Solid build.
		ssr: { noExternal: true },
	})
	answerStyles(vite)
	const served = serverTimeline()
	const origin = `http://127.0.0.1:${portOf(await listen(http, vite, { cases, apps, served }))}`
	const endpoints = await browserEndpoint()
	const browsers = new Map<Engine, Browser>()
	const browser = async (engine: Engine): Promise<Browser> => {
		// Chromium connects to its own run-server, routed through the loopback proxy (BUGS.md 484).
		const at = engine === "chromium" ? endpoints?.chromium : endpoints && { endpoint: endpoints.endpoint, headers: {} }
		const open =
			browsers.get(engine) ??
			(at === undefined
				? await TYPES[engine].launch()
				: await TYPES[engine].connect(at.endpoint, { timeout: 60_000, headers: at.headers }))
		browsers.set(engine, open)
		return open
	}
	return {
		hydrate: (engine, tree) => hydrateIn({ cases, origin, browser: () => browser(engine) }, tree),
		async app(engine, input) {
			const id = `a${apps.cases.size + 1}`
			apps.cases.set(id, input)
			apps.active = id
			await primeApp(vite, { id, origin, prime: input.prime })
			const context = await (await browser(engine)).newContext()
			try {
				return await appIn({ origin, tab: await context.newPage(), server: served }, input)
			} finally {
				await context.close()
				apps.active = undefined
			}
		},
		async close() {
			for (const open of browsers.values()) await open.close()
			await new Promise((resolve) => http.close(resolve))
			await vite.close()
			rmSync(cacheDir, { recursive: true, force: true })
		},
	}
}

const ours = (id: string): boolean => [CASE, CLIENT, APP, APP_CLIENT].some((prefix) => id.startsWith(prefix))

// A case's tree as a module, and the client entry that hydrates it. The tree's source is the test's function text.
function casePlugin(cases: Map<string, string>, apps: Apps): Plugin {
	return {
		name: "flare-hydrate-cases",
		resolveId: (id) => (ours(id) ? `\0${id}` : undefined),
		load(id) {
			if (id.startsWith(`\0${APP_CLIENT}`)) {
				const app = id.slice(APP_CLIENT.length + 1)
				const input = apps.cases.get(app)
				return appClientModule(app, input?.client.toString() ?? "() => undefined", input?.hydrateAfter)
			}
			if (id.startsWith(`\0${APP}`)) {
				const app = apps.cases.get(id.slice(APP.length + 1))
				return appModule(apiImports(), API_NAMES, app?.app.toString() ?? "undefined")
			}
			if (id.startsWith(`\0${CASE}`)) return caseModule(cases.get(id.slice(CASE.length + 1)) ?? "undefined")
			if (id.startsWith(`\0${CLIENT}`)) return clientModule(id.slice(CLIENT.length + 1))
			return undefined
		},
	}
}

const API_NAMES = `solid, web, h, ${Object.keys(MODULES).join(", ")}`

function apiImports(): string[] {
	const imports = Object.entries(MODULES).map(([name, path]) => `import * as ${name} from ${JSON.stringify(path)};`)
	return [
		`import * as solid from "solid-js";`,
		`import * as web from "@solidjs/web";`,
		...imports,
		`const h = (tag, id, children) => solid.createComponent(web.Dynamic, { component: tag, id, get children() { return children?.(); } });`,
	]
}

function caseModule(source: string): string {
	return [...apiImports(), `export const api = { ${API_NAMES} };`, `export const tree = ${source};`].join("\n")
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
	].join("\n")
}

// The browser's method, headers, and body, as the app's server should see them.
async function requestInit(req: IncomingMessage): Promise<RequestInit> {
	const headers = new Headers()
	for (const [name, value] of Object.entries(req.headers)) {
		for (const each of Array.isArray(value) ? value : [value]) if (each !== undefined) headers.append(name, each)
	}
	const method = req.method ?? "GET"
	if (method === "GET" || method === "HEAD") return { method, headers }
	const chunks: Buffer[] = []
	for await (const chunk of req) chunks.push(Buffer.from(chunk as Uint8Array))
	return { method, headers, body: Buffer.concat(chunks) }
}

async function listen(
	http: Server,
	vite: ViteDevServer,
	{ cases, apps, served }: { cases: Map<string, string>; apps: Apps; served: ServerTimeline },
): Promise<Server> {
	http.on("request", (req, res) => {
		const url = req.url ?? "/"
		const active = apps.active
		if (active !== undefined && isAppRequest(url)) {
			const origin = `http://127.0.0.1:${portOf(http)}`
			const request = served.request(url)
			void requestInit(req)
				.then((init) => appDocument(vite, { id: active, url, origin, init, served: request }))
				.then(
					(answer) => {
						request.sent(res)
						res.writeHead(answer.status, Object.fromEntries(answer.headers))
						res.end(answer.body)
					},
					(error: unknown) => {
						res.writeHead(500)
						res.end(String(error))
					},
				)
			return
		}
		const id = /^\/case\/(\w+)$/.exec(url)?.[1]
		if (id === undefined || !cases.has(id)) return vite.middlewares(req, res)
		void documentOf(vite, id).then(
			(body) => {
				res.writeHead(200, { "content-type": "text/html" })
				res.end(body)
			},
			(error: unknown) => {
				res.writeHead(500)
				res.end(String(error))
			},
		)
	})
	await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve))
	return http
}

function portOf(http: Server): number {
	const address = http.address()
	if (address === null || typeof address === "string") throw new Error("the harness server has no port")
	return address.port
}

// The server render of a case, in a document with Solid's hydration script and the client entry.
async function documentOf(vite: ViteDevServer, id: string): Promise<string> {
	const ssr = vite.environments.ssr
	if (!isRunnableDevEnvironment(ssr)) throw new Error("the SSR environment cannot run modules")
	const loaded: { api: Api; tree: Tree } = await ssr.runner.import(`${CASE}${id}`)
	const html = loaded.api.web.renderToString(() => loaded.tree(loaded.api, "server"))
	const script = loaded.api.web.generateHydrationScript()
	return `<!doctype html><html><head>${script}</head><body><div id="host">${html}</div><script type="module" src="/@id/${CLIENT}${id}"></script></body></html>`
}

async function hydrateIn(
	at: { cases: Map<string, string>; origin: string; browser: () => Promise<Browser> },
	tree: Tree,
): Promise<Hydrated> {
	const id = `c${at.cases.size + 1}`
	at.cases.set(id, tree.toString())
	const context = await (await at.browser()).newContext()
	try {
		const tab = await context.newPage()
		const problems: string[] = []
		// Everything the page said, so a client that never finishes reports why.
		const seen: string[] = []
		tab.on("console", (message) => {
			seen.push(`${message.type()}: ${message.text()}`)
			if (PROBLEM.test(message.text())) problems.push(message.text())
		})
		tab.on("pageerror", (error) => {
			seen.push(`pageerror: ${error.message}`)
			problems.push(`pageerror: ${error.message}`)
		})
		tab.on("requestfailed", (request) => void seen.push(`failed: ${request.url()} ${request.failure()?.errorText}`))
		tab.on("response", (answer) => {
			if (answer.status() >= 400) seen.push(`${answer.status()}: ${answer.url()}`)
		})
		const response = await tab.goto(`${at.origin}/case/${id}`)
		const html = (await response?.text()) ?? ""
		await tab
			.waitForFunction(() => Reflect.get(globalThis, "__flareHydrated") === true, undefined, { timeout: 10_000 })
			.catch((error: unknown) => {
				throw new Error(`the client did not hydrate: ${String(error)}\n${seen.join("\n")}`)
			})
		const text = (await tab.locator("#host").textContent()) ?? ""
		return { html, problems, text }
	} finally {
		await context.close()
	}
}
