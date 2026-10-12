import { defined } from "../../shared/errors/index.ts";
import { withServerContext } from "../context/ctx.ts";
import { drawn, framed, loaderInput, type Loaded } from "../lifecycle/answers.ts";
import type { Exchange } from "../lifecycle/exchange.ts";
import { runLoaders, type LoaderRun } from "../loaders/run.ts";
import { dataBody, dataFrames } from "../navigation/index.ts";

// The request every shared render makes: `site` plus the canonical pathname, with no search and no request
// headers, so no cookie, no authorization, and no Host reach a body that every visitor is served (dx/cache.md).
export function sharedRequest(site: string, request: Request): Request {
	return new Request(new URL(new URL(request.url).pathname, site));
}

// A shared render that finished as a clean 200. `html` is the shell, `nonce` the one its tags carry, and `settled`
// is every "resolve" value fulfilled. `startedAt` is the render's start, the entry's `storedAt`.
export type SharedRender = {
	run: LoaderRun;
	html: string;
	ndjson: string;
	nonce: string;
	settled: boolean;
	startedAt: number;
};

const NOTHING_STALE: ReadonlySet<string> = new Set();

// The loaders, the render, and `serverContext` all run on the shared request. `serverContext` is called again for
// it with the same env, so `serverCtx()` there never holds the visitor's cookie. Its session is null, so an
// optional-auth chain stores its anonymous render (B27). It renders as a document, so one run writes both the
// HTML and the NDJSON. A run that is not a clean 200, or a render that fails, gives nothing to store.
export function sharedRender(exchange: Exchange, matched: Loaded): Promise<SharedRender | undefined> {
	const request = sharedRequest(defined(exchange.options.site, "the site a store requires"), exchange.request);
	const { env, store, waitUntil } = exchange;
	const context = { request, env, serverContext: exchange.options.serverContext, store, waitUntil };
	return withServerContext(
		context,
		(scope) => rendered({ ...exchange, request, session: scope.session, kind: "document", stale: null }, matched),
		() => undefined,
	);
}

async function rendered(shared: Exchange, matched: Loaded): Promise<SharedRender | undefined> {
	const startedAt = Date.now();
	const run = await runLoaders({ ...loaderInput(shared, matched), shared: true, stored: true });
	// "resolve" values are awaited. "stream" functions never ran, so their holes stay placeholders.
	const results = await Promise.allSettled(run.deferred.map((entry) => entry.promise));
	if (run.response.status !== 200) return undefined;
	const document = await drawn(shared, { chain: matched.chain, run });
	if ("failed" in document) return undefined;
	const html = await shellOf(document.body);
	const project = framed(shared);
	const ndjson = await new Response(
		dataBody({ ...dataFrames(run, NOTHING_STALE), deferred: run.deferred, project }),
	).text();
	const settled = results.every((result) => result.status === "fulfilled");
	return { run, html, ndjson, nonce: document.exchange.secured.nonce, settled, startedAt };
}

// The shell holds every settled value and each `"stream"` hole's fallback. A hole never closes the stream, so the
// read stops at `</html>`, however the stream is chunked, and the render is cancelled. A root that renders no
// `<html>` never closes one, so the read stops after its first chunk. Its body is never stored.
export async function shellOf(body: ReadableStream<Uint8Array>): Promise<string> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let html = "";
	for (let next = await reader.read(); !next.done; next = await reader.read()) {
		html += decoder.decode(next.value, { stream: true });
		if (html.includes("</html>") || !html.includes("<html")) break;
	}
	void reader.cancel();
	return html + decoder.decode();
}

// `store` needs `site`, checked at the call. `site` is an absolute origin with no path, search, or hash, and it is
// `https` outside dev (dx/server.md).
export function checkSite(site: string | undefined, at: { store: boolean; dev: boolean }): void {
	if (site === undefined) {
		if (at.store) throw new Error("createServer: store needs site, the origin every shared render requests");
		return;
	}
	const url = URL.canParse(site) ? new URL(site) : undefined;
	const secure = url?.protocol === "https:" || (at.dev && url?.protocol === "http:");
	if (url === undefined || !secure || `${url.origin}` !== site.replace(/\/$/, "")) {
		throw new Error(`createServer: site must be an absolute https origin with no path, not ${site}`);
	}
}
