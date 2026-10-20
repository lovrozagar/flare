import { createNodeListener } from "../../adapters/node/index.ts"
import { mintTab, sentTab, tabMeta } from "../../shared/protocol/index.ts"
import { createTabs, TAB_EVENT, tabbedPayload, type TabClient } from "./tabs.ts"

// What the handler needs from Vite's dev server. A real `ViteDevServer` is one. A test passes a small object.
export type DevServer = {
	config: { server: { middlewareMode?: unknown }; logger: { error(message: string): void } }
	middlewares: { use(handler: (req: DevRequest, res: NodeResponse) => void): unknown }
	environments: {
		ssr: { hot: ErrorChannel; runner?: { import(id: string): Promise<Record<string, unknown>> } }
		client: { hot: { on(event: string, listener: (payload: unknown, client: TabClient) => void): void } }
	}
}

type ErrorChannel = { on(event: "flare:error", listener: (payload: unknown) => void): void }

type Listener = ReturnType<typeof createNodeListener>

// Node's IncomingMessage, as much of it as the listener reads. The listener takes it as it is.
export type DevRequest = Parameters<Listener>[0]

type NodeResponse = Parameters<Listener>[1]

type AppServer = { fetch: (request: Request, env?: unknown, ctx?: unknown) => Promise<Response> | Response }

export type DevDeps = {
	load: () => Promise<AppServer>
	// The token for a module-load failure's page when the request names none (B42). The app's own documents carry the
	// token the server minted (B95 (b)).
	tab?: () => string
	report?: (error: unknown, token: string | undefined) => void
	// The dev head, Vite's client and every plugin's tags, which the failure page carries (dev-head.ts).
	head?: Promise<string>
	// Where a module-load failure is logged, its message and stack in one line: Vite's logger, so the terminal that runs
	// `vite dev` names it, as the app's own logger names a render bug (BUGS.md 301).
	log?: (line: string) => void
}

// On Node and Bun, `vite dev` answers every request the Vite middlewares did not (B89). Embedded in another server,
// `middlewareMode`, it is not installed. The app's documents pass through as the server wrote them, dev tags included
// (B95 (b)). A dev error opens Vite's overlay only in the tab that caused it: a server graph's `flare:error` by its
// request's tab token, from the ssr environment, which renders in workerd when the Cloudflare plugin runs it (B95 (c),
// B109), and a client's own `flare:error` back to that client (B93, B42).
export function installDevHandler(server: DevServer, entry: string, head?: Promise<string>): (() => void) | undefined {
	if (server.config.server.middlewareMode) return undefined
	const tabs = createTabs()
	const client = server.environments.client.hot
	const relay = (message: unknown): void => {
		const { token, payload } = tabbedPayload(message)
		tabs.deliver(token, payload)
	}
	server.environments.ssr.hot.on("flare:error", relay)
	client.on("flare:error", (payload, tab) => tab.send(payload))
	client.on(TAB_EVENT, (announced, tab) => {
		const token: unknown = Reflect.get(Object(announced), "token")
		if (typeof token === "string") tabs.announce(token, tab)
	})
	client.on("vite:client:disconnect", (_payload, tab) => tabs.drop(tab))
	const listener = devListener({
		load: () => loadEntry(server, entry),
		tab: mintTab,
		report: (error, token) => tabs.deliver(token, overlayPayload(error)),
		log: (line) => server.config.logger.error(line),
		...(head === undefined ? {} : { head }),
	})
	// A post hook: Vite serves modules and assets first, and the app answers the rest.
	return () => server.middlewares.use((req, res) => listener(req, res))
}

// The Node adapter's listener over the dev fetch: streaming, `Set-Cookie`, and a client abort as in production.
export function devListener(deps: DevDeps): ReturnType<typeof createNodeListener> {
	return createNodeListener({ fetch: devFetch(deps) })
}

// The app's answer, as it is. A module that failed to load answers the dev error page in the request's tab.
export function devFetch(deps: DevDeps): (request: Request, env?: unknown, ctx?: unknown) => Promise<Response> {
	return async (request, env, ctx) => {
		try {
			return await (await deps.load()).fetch(request, env, ctx)
		} catch (error) {
			const token = sentTab(request) ?? deps.tab?.()
			const { err } = overlayPayload(error)
			deps.log?.(err.stack === "" ? `[flare:load] ${err.message}` : `[flare:load] ${err.message}\n${err.stack}`)
			deps.report?.(error, token)
			return failed(error, token, (await deps.head) ?? "")
		}
	}
}

async function loadEntry(server: DevServer, entry: string): Promise<AppServer> {
	const runner = server.environments.ssr.runner
	if (runner === undefined) throw new Error("The SSR environment cannot run modules. Workers dev is unsupported")
	const loaded = (await runner.import(`/${entry}`))["server"]
	if (typeof loaded !== "object" || loaded === null || !("fetch" in loaded) || typeof loaded.fetch !== "function") {
		throw new Error(`${entry} exports no server`)
	}
	const fetch = loaded.fetch.bind(loaded)
	return { fetch: (request, env, ctx) => fetch(request, env, ctx) }
}

// A module that failed to load is a dev document with the message and the stack, and Vite's overlay opens in its tab:
// the dev head brings Vite's client, and a module announces the tab over Vite's hot channel, as the flare client would,
// so the payload held for that token is delivered. Fixing the file brings the app back: Vite's client loads the page
// again on a full reload, which Solid's plugin sends for a module only the server graph holds, and on its first update
// while the overlay is open (plan 21 11.6).
function failed(error: unknown, token: string | undefined, head: string): Response {
	const { err } = overlayPayload(error)
	const tag = token === undefined ? "" : tabMeta(token)
	const client = CLIENT_SRC.exec(head)?.[1] ?? "/@vite/client"
	const announce =
		token === undefined
			? ""
			: `<script type="module">import { createHotContext } from ${JSON.stringify(client)};` +
				`createHotContext("/@flare/dev-error").send("flare:tab", { token: ${JSON.stringify(token)} })</script>`
	const pre = `<pre>${escape(`${err.message}\n${err.stack}`)}</pre>`
	const body = `<!doctype html><html><head>${tag}${head}${announce}</head><body>${pre}</body></html>`
	return new Response(body, { status: 500, headers: { "content-type": "text/html; charset=utf-8" } })
}

// The URL the dev head loads Vite's client from, under Vite's base.
const CLIENT_SRC = /src="([^"]*@vite\/client)"/

function overlayPayload(error: unknown): { type: "error"; err: { message: string; stack: string } } {
	const thrown = error instanceof Error ? error : new Error(String(error))
	return { type: "error", err: { message: thrown.message, stack: thrown.stack ?? "" } }
}

function escape(text: string): string {
	return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}
