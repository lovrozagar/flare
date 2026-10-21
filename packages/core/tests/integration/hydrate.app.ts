import type { Page } from "@playwright/test"
import { isRunnableDevEnvironment, type ViteDevServer } from "vite"
import { vi } from "vitest"
import { STYLES_EVENT, stylesRequest } from "../../src/shared/protocol/index.ts"
import type { Api, Side } from "./hydrate.harness.ts"
import type { createClient } from "../../src/client/boot/create-client.ts"

// The harness's app mode (B96): a real document `createServer(...).fetch` serves from Solid's server build in Vite's SSR
// runner, hydrated in a real engine by the real `createClient` with Solid's browser build. A case is its app (the
// router, built on both sides from the same source, as an app's one source builds twice) and its client callbacks.

// `app` and `client` are compiled into each side as source, so they read only their arguments. `server` is the app's
// createServer options beside the router: a `store` makes the harness origin its `site`.
export type AppCase = {
	app: (api: Api, side: Side) => { router: unknown; server?: Record<string, unknown> }
	// Given what `createClient(router)` returned and the page's record, which the result reads back.
	client: (client: ReturnType<typeof createClient>, record: unknown[]) => void
	// The path the page loads. `/` when omitted.
	path?: string
	// Milliseconds the client entry waits before `createClient`, so hydration lands after the page's load event.
	hydrateAfter?: number
	// Runs on the hydrated page before the record is read: a click, a key, a wait.
	steps?: (tab: Page) => Promise<void>
	// Runs on the tab before it loads the page: a clock to install, say.
	init?: (tab: Page) => Promise<void>
	// Paths the server answers until it serves them from its store, before the page loads. `at` is the clock the
	// server renders and stores them on: only `Date` is faked, and only while priming.
	prime?: readonly { path: string; at?: number }[]
}

// `requests` are the data, fill, and prefetch URLs the page asked for, from its first load on.
export type AppResult = { status: number; html: string; problems: string[]; record: unknown[]; requests: string[] }

export const APP = "virtual:flare-hydrate/app-"
export const APP_CLIENT = "virtual:flare-hydrate/app-client-"

// The app module both sides import: the shared api and the case's app function.
export function appModule(imports: readonly string[], names: string, source: string): string {
	return [...imports, `export const api = { ${names} };`, `export const app = ${asExpression(source)};`].join("\n")
}

// A function's source as an expression: a method shorthand (`client(client, record) { … }`), as an object literal
// writes it, becomes a function expression; an arrow or a `function` stays as it is.
function asExpression(source: string): string {
	if (/^(?:async\s+)?(?:function\b|\()/.test(source) || /^(?:async\s+)?\w+\s*=>/.test(source)) return source
	return source.replace(/^(async\s+)?/, (_, prefix: string | undefined) => `${prefix ?? ""}function `)
}

// The page's client entry: the real createClient over the app's router, then the case's callbacks, which push into
// the record the harness reads back. A throw is reported on the console with the other problems.
export function appClientModule(id: string, clientSource: string, hydrateAfter = 0): string {
	return [
		`import { api, app } from ${JSON.stringify(`${APP}${id}`)};`,
		`import { createClient } from "/src/client/boot/create-client.ts";`,
		`const record = [];`,
		`window.__flareRecord = record;`,
		`const boot = () => {`,
		`	try {`,
		`		const client = createClient(app(api, "client").router);`,
		`		(${asExpression(clientSource)})(client, record);`,
		`	} catch (error) {`,
		`		console.error(String(error));`,
		`	}`,
		`};`,
		hydrateAfter > 0 ? `setTimeout(boot, ${hydrateAfter});` : `boot();`,
	].join("\n")
}

// A request the app answers rather than Vite: anything that is not one of Vite's own module paths.
export function isAppRequest(url: string): boolean {
	return !/^\/(?:@|src\/|node_modules\/|__)/.test(url)
}

// The real server's answer for the app, with the harness's client entry added before `</body>`: without flare(), the
// document carries no client script of its own (server/lifecycle/build-info.ts). The request keeps the browser's
// method, headers, and body, so a POST server function and a cookie reach the server as sent.
export async function appDocument(
	vite: ViteDevServer,
	input: { id: string; url: string; origin: string; init?: RequestInit },
): Promise<{ status: number; headers: Headers; body: string }> {
	const ssr = vite.environments.ssr
	if (!isRunnableDevEnvironment(ssr)) throw new Error("the SSR environment cannot run modules")
	const response = await (await serverOf(vite, input)).fetch(new Request(`${input.origin}${input.url}`, input.init))
	const text = await response.text()
	if (!(response.headers.get("content-type") ?? "").startsWith("text/html")) {
		return { status: response.status, headers: response.headers, body: text }
	}
	const entry = `<script type="module" src="/@id/${APP_CLIENT}${input.id}"></script>`
	// A root that renders no `<body>` leaves the document without one: the entry then goes last.
	const body = text.includes("</body>") ? text.replace("</body>", `${entry}</body>`) : `${text}${entry}`
	return { status: response.status, headers: response.headers, body }
}

type AppServer = { fetch: (request: Request) => Promise<Response> }

// One server per app, so its store lasts across the app's requests.
const servers = new Map<string, Promise<AppServer>>()

function serverOf(vite: ViteDevServer, input: { id: string; origin: string }): Promise<AppServer> {
	const known = servers.get(input.id)
	if (known !== undefined) return known
	const made = (async () => {
		const ssr = vite.environments.ssr
		if (!isRunnableDevEnvironment(ssr)) throw new Error("the SSR environment cannot run modules")
		const loaded: { api: Api; app: AppCase["app"] } = await ssr.runner.import(`${APP}${input.id}`)
		const create: { createServer: (options: Record<string, unknown>) => AppServer } = await ssr.runner.import(
			"/src/server/lifecycle/create.ts",
		)
		const app = loaded.app(loaded.api, "server")
		const site = app.server?.["store"] === undefined ? {} : { site: input.origin }
		return create.createServer({ router: app.router, ...site, ...app.server })
	})()
	servers.set(input.id, made)
	return made
}

// Asks for each path until the app's server answers it from its store, on the path's clock when it has one.
export async function primeApp(vite: ViteDevServer, input: { id: string; origin: string; prime: AppCase["prime"] }) {
	const server = await serverOf(vite, input)
	for (const { path, at } of input.prime ?? []) {
		if (at !== undefined) vi.useFakeTimers({ toFake: ["Date"], now: at })
		try {
			for (let tries = 0; ; tries++) {
				const answer = await server.fetch(new Request(`${input.origin}${path}`))
				await answer.text()
				if (answer.headers.get("flare-cache") === "hit") break
				if (tries === 50) throw new Error(`${path} was never stored`)
				await new Promise((resolve) => setTimeout(resolve, 20))
			}
		} finally {
			vi.useRealTimers()
		}
	}
}

// Loads the app's page in a fresh context, waits for `createClient` to mark the document hydrated, runs the case's
// steps, and reads back the record and everything the page reported.
export async function appIn(at: { origin: string; tab: Page }, input: AppCase): Promise<AppResult> {
	const problems: string[] = []
	const seen: string[] = []
	const requests: string[] = []
	at.tab.on("request", (request) => {
		if (request.url().includes("_flare=")) requests.push(request.url().replace(at.origin, ""))
	})
	at.tab.on("console", (message) => {
		seen.push(`${message.type()}: ${message.text()}`)
		if (message.type() === "error" || /hydration|key miss|unclaimed|STRICT_READ_UNTRACKED/i.test(message.text())) {
			problems.push(message.text())
		}
	})
	at.tab.on("pageerror", (error) => {
		seen.push(`pageerror: ${error.message}`)
		problems.push(`pageerror: ${error.message}`)
	})
	at.tab.on("requestfailed", (request) => void seen.push(`failed: ${request.url()} ${request.failure()?.errorText}`))
	at.tab.on("response", (answer) => {
		if (answer.status() >= 400) seen.push(`${answer.status()}: ${answer.url()}`)
	})
	await input.init?.(at.tab)
	const loads = timeline(at.tab, at.origin)
	// A document whose load never fires says which of its loads were still in flight (CI's WebKit, 2026-10-21).
	const response = await at.tab.goto(`${at.origin}${input.path ?? "/"}`).catch((error: unknown) => {
		throw new Error(`the document did not load: ${String(error)}\n${[...seen, ...loads.lines()].join("\n")}`)
	})
	const html = (await response?.text()) ?? ""
	await at.tab
		// Ten times the slowest hydration measured in the full gate (1.15 s over 128 cases, BUGS.md 140): past it, the
		// timeline says whether the loads were progressing or stalled.
		.waitForSelector("html[data-flare-hydrated]", { state: "attached", timeout: 10_000 })
		.catch((error: unknown) => {
			const lines = [...seen, ...loads.lines()]
			throw new Error(`the client did not hydrate: ${String(error)}\n${lines.join("\n")}\n${html.slice(-600)}`)
		})
	await input.steps?.(at.tab)
	const record: unknown[] = await at.tab.evaluate(() => Reflect.get(window, "__flareRecord") ?? [])
	return { status: response?.status() ?? 0, html, problems, record, requests }
}

// Every request the page makes, timed from its first: when each started and when it finished or failed, or that it
// was still in flight. A page that does not hydrate shows whether its loads were progressing or stalled.
function timeline(tab: Page, origin: string): { lines: () => string[] } {
	const start = performance.now()
	const at = (): string => `${Math.round(performance.now() - start)}ms`
	const loads = new Map<unknown, { url: string; started: string; ended?: string }>()
	tab.on("request", (request) => void loads.set(request, { url: request.url().replace(origin, ""), started: at() }))
	const end = (request: unknown, how: string): void => {
		const load = loads.get(request)
		if (load !== undefined) load.ended = `${how} ${at()}`
	}
	tab.on("requestfinished", (request) => end(request, "finished"))
	tab.on("requestfailed", (request) => end(request, "failed"))
	return {
		lines: () =>
			[...loads.values()].map(
				(load) => `load ${load.url} started ${load.started}, ${load.ended ?? `in flight at ${at()}`}`,
			),
	}
}

// Without flare(), nothing answers the dev server's `flare:styles` request, and a dev document would wait for it.
// The harness plays the dev server for an app with no stylesheet: every chain has no styles.
export function answerStyles(vite: ViteDevServer): void {
	vite.environments.ssr?.hot.on(
		STYLES_EVENT,
		(payload: unknown, client: { send: (event: string, data: unknown) => void }) => {
			const asked = stylesRequest(payload)
			if (asked !== undefined) client.send(STYLES_EVENT, { request: asked.request, styles: [] })
		},
	)
}
