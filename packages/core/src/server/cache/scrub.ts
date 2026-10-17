import { withServerContext } from "../context/ctx.ts"
import { drawn, framed, loaderInput, type Loaded } from "../lifecycle/answers.ts"
import { answerQueries } from "../render/state.ts"
import type { Exchange } from "../lifecycle/exchange.ts"
import { runLoaders, type LoaderRun } from "../loaders/run.ts"
import { dataBody, dataFrames } from "../navigation/index.ts"

// The request every shared render makes: `site` plus the canonical pathname, with no search and no request
// headers, so no cookie, no authorization, and no Host reach a body that every visitor is served (dx/cache.md).
export function sharedRequest(site: string, request: Request): Request {
	return new Request(new URL(new URL(request.url).pathname, site))
}

// A shared render that finished as a clean 200. `html` is the shell, `nonce` the one its tags carry, and `settled`
// is every "resolve" value fulfilled. `startedAt` is the render's start, the entry's `storedAt`.
export type SharedRender = {
	run: LoaderRun
	html: string
	ndjson: string
	nonce: string
	settled: boolean
	startedAt: number
}

// A shared render whose body did not complete within SETTLE_MS after its shell: it is served live and never stored.
export const INCOMPLETE = "incomplete"

// How long a stored render may take to complete after its shell (dx/cache.md). Fixed, not an option.
export const SETTLE_MS = 10_000

const NOTHING_STALE: ReadonlySet<string> = new Set()

// The loaders, the render, and `serverContext` all run on the shared request. `serverContext` is called again for
// it with the same env, so `serverCtx()` there never holds the visitor's cookie. Its session is null, so an
// optional-auth chain stores its anonymous render (B27). It renders as a document, so one run writes both the
// HTML and the NDJSON. A run that is not a clean 200, or a render that fails, gives nothing to store.
export function sharedRender(
	exchange: Exchange,
	matched: Loaded,
): Promise<SharedRender | typeof INCOMPLETE | undefined> {
	// A store requires `site`. A public page with none behind it renders on the request's own origin (plan 21 4.4).
	const request = sharedRequest(exchange.options.site ?? new URL(exchange.request.url).origin, exchange.request)
	const { env, store, waitUntil } = exchange
	const context = { request, env, serverContext: exchange.options.serverContext, store, waitUntil }
	return withServerContext(
		context,
		(scope) => rendered({ ...exchange, request, session: scope.session, kind: "document", stale: null }, matched),
		() => undefined,
	)
}

async function rendered(shared: Exchange, matched: Loaded): Promise<SharedRender | typeof INCOMPLETE | undefined> {
	const startedAt = Date.now()
	const run = await runLoaders({ ...loaderInput(shared, matched), shared: true, stored: true })
	// "resolve" values are awaited. "stream" functions never ran, so their holes stay placeholders.
	const results = await Promise.allSettled(run.deferred.map((entry) => entry.promise))
	if (run.response.status !== 200) return undefined
	const document = await drawn(shared, { chain: matched.chain, run }, { quiet: true })
	if ("failed" in document) return undefined
	const html = await shellOf(document.body)
	if (html === undefined) {
		shared.sink.log.warn(
			"cache",
			`${String(matched.id)} did not complete its render within 10 s of its shell: served live, not stored`,
		)
		return INCOMPLETE
	}
	// A fragment that failed after the shell would replay its failure for the whole ttl: the visitor's answer is the
	// live render, which logs it (plan 21 3.2).
	if (document.late.length > 0) return undefined
	const project = framed(shared)
	// A fulfilled value travels inline in its `l` frame, so only a rejection still needs a frame (BUGS.md 94).
	const deferred = run.deferred.filter((_, index) => results[index]?.status === "rejected")
	const queries = answerQueries(shared.sink)
	const ndjson = await new Response(dataBody({ ...dataFrames(run, NOTHING_STALE), deferred, project, queries })).text()
	const settled = results.every((result) => result.status === "fulfilled")
	return { run, html, ndjson, nonce: document.exchange.secured.nonce, settled, startedAt }
}

// A stored write waits until Solid's render completes (BUGS.md B15). A `"stream"` hole renders its fallback on the
// client's side (`ssrSource: "client"`), so it holds no boundary open, and every other boundary, the app's own async
// included, flushes its fragment before the stream ends. A render still open SETTLE_MS after its shell (`</html>`)
// gives nothing, and the render is cancelled. A root that renders no `<html>` stops after its first chunk. Its body is
// never stored.
export async function shellOf(body: ReadableStream<Uint8Array>): Promise<string | undefined> {
	const reader = body.getReader()
	const decoder = new TextDecoder()
	let html = ""
	let late: Promise<undefined> | undefined
	let timer: ReturnType<typeof setTimeout> | undefined
	try {
		for (;;) {
			const next = await (late === undefined ? reader.read() : Promise.race([reader.read(), late]))
			if (next === undefined) return undefined
			if (next.done) return html + decoder.decode()
			html += decoder.decode(next.value, { stream: true })
			if (!html.includes("<html")) return html + decoder.decode()
			if (late === undefined && html.includes("</html>"))
				late = new Promise((resolve) => (timer = setTimeout(() => resolve(undefined), SETTLE_MS)))
		}
	} finally {
		clearTimeout(timer)
		void reader.cancel()
	}
}

// `store` needs `site`, checked at the call. `site` is an absolute origin with no path, search, or hash, and it is
// `https` outside dev (dx/server.md).
export function checkSite(site: string | undefined, at: { store: boolean; dev: boolean }): void {
	if (site === undefined) {
		if (at.store) throw new Error("createServer: store needs site, the origin every shared render requests")
		return
	}
	const url = URL.canParse(site) ? new URL(site) : undefined
	const secure = url?.protocol === "https:" || (at.dev && url?.protocol === "http:")
	if (url === undefined || !secure || `${url.origin}` !== site.replace(/\/$/, "")) {
		throw new Error(`createServer: site must be an absolute https origin with no path, not ${site}`)
	}
}
