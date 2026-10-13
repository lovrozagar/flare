import { createNodeListener } from "../../adapters/node/index.ts";
import { TAB_HEADER } from "../../shared/protocol/index.ts";
import { createTabs, TAB_EVENT, tabbedPayload, tabMeta, tabToken, type TabClient } from "./tabs.ts";

// What the handler needs from Vite's dev server. A real `ViteDevServer` is one. A test passes a small object.
export type DevServer = {
	config: { server: { middlewareMode?: unknown } };
	middlewares: { use(handler: (req: DevRequest, res: NodeResponse) => void): unknown };
	transformIndexHtml(url: string, html: string): Promise<string>;
	environments: {
		ssr: {
			hot: { on(event: "flare:error", listener: (payload: unknown) => void): void };
			runner?: { import(id: string): Promise<Record<string, unknown>> };
		};
		client: { hot: { on(event: string, listener: (payload: unknown, client: TabClient) => void): void } };
	};
};

type Listener = ReturnType<typeof createNodeListener>;

// Node's IncomingMessage, as much of it as the listener reads. The listener takes it as it is.
export type DevRequest = Parameters<Listener>[0];

type NodeResponse = Parameters<Listener>[1];

type AppServer = { fetch: (request: Request, env?: unknown, ctx?: unknown) => Promise<Response> | Response };

export type DevDeps = {
	load: () => Promise<AppServer>;
	transform: (url: string, html: string) => Promise<string>;
	// The token minted for a document with no `flare-dev-tab` header (B42). Without it, no token is minted or written.
	tab?: () => string;
	report?: (error: unknown, token: string | undefined) => void;
};

// An inline script or style, one with no `src`. Vite would rewrite it, and a nonced inline tag must stay as the
// server wrote it.
const INLINE = /<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>|<style[^>]*>[\s\S]*?<\/style>/g;

// Vite prepends its client right after `<head …>`. A component the root layout renders in `<head>` hydrates by walking
// the head from its first child, so a marker shows where Vite's tags end, and they move to just before `</head>`.
const HEAD_OPEN = /<head(?:\s[^>]*)?>/i;
const HEAD_MARK = "<!--flare-head-->";
const HEAD_CLOSE = "</head>";
const PREPENDED = /(<head(?:\s[^>]*)?>)([\s\S]*?)<!--flare-head-->([\s\S]*?)(<\/head>)/i;

// The request nonce, read from the policy the app answered with. Vite's client reads it from a `csp-nonce` meta for
// the styles it injects and its error overlay, so a nonce CSP does not block them. Dev only: production has no client.
const POLICY_NONCE = /'nonce-([A-Za-z0-9+/=_-]+)'/;

type Shell = { url: string; nonce: string | undefined; token: string | undefined };

// On Node and Bun, `vite dev` answers every request the Vite middlewares did not (B89). Embedded in another server,
// `middlewareMode`, it is not installed. A dev error opens Vite's overlay only in the tab that caused it: the SSR
// graph's `flare:error` by its request's tab token, and a client's own `flare:error` back to that client (B93, B42).
export function installDevHandler(server: DevServer, entry: string): (() => void) | undefined {
	if (server.config.server.middlewareMode) return undefined;
	const tabs = createTabs();
	const client = server.environments.client.hot;
	server.environments.ssr.hot.on("flare:error", (message) => {
		const { token, payload } = tabbedPayload(message);
		tabs.deliver(token, payload);
	});
	client.on("flare:error", (payload, tab) => tab.send(payload));
	client.on(TAB_EVENT, (announced, tab) => {
		const token: unknown = Reflect.get(Object(announced), "token");
		if (typeof token === "string") tabs.announce(token, tab);
	});
	client.on("vite:client:disconnect", (_payload, tab) => tabs.drop(tab));
	const listener = devListener({
		load: () => loadEntry(server, entry),
		transform: (url, html) => server.transformIndexHtml(url, html),
		tab: tabToken,
		report: (error, token) => tabs.deliver(token, overlayPayload(error)),
	});
	// A post hook: Vite serves modules and assets first, and the app answers the rest.
	return () => server.middlewares.use((req, res) => listener(req, res));
}

// The Node adapter's listener over the dev fetch: streaming, `Set-Cookie`, and a client abort as in production.
export function devListener(deps: DevDeps): ReturnType<typeof createNodeListener> {
	return createNodeListener({ fetch: devFetch(deps) });
}

// HTML is buffered and goes through `transformIndexHtml` with its inline tags peeled. Other bodies stream.
export function devFetch(deps: DevDeps): (request: Request, env?: unknown, ctx?: unknown) => Promise<Response> {
	return async (request, env, ctx) => {
		// A tab's own request names it. A document gets a fresh token, which the page below carries back (B42).
		const token = deps.tab === undefined ? undefined : (request.headers.get(TAB_HEADER) ?? deps.tab());
		if (token !== undefined) request.headers.set(TAB_HEADER, token);
		let response: Response;
		try {
			response = await (await deps.load()).fetch(request, env, ctx);
		} catch (error) {
			deps.report?.(error, token);
			return failed(error, token);
		}
		if (!(response.headers.get("content-type") ?? "").startsWith("text/html") || response.body === null) {
			return response;
		}
		const headers = new Headers(response.headers);
		headers.delete("content-length");
		const nonce = POLICY_NONCE.exec(headers.get("content-security-policy") ?? "")?.[1];
		const body = await transformedHead(deps, { url: transformUrl(request.url), nonce, token }, response.body);
		return new Response(body, { status: response.status, headers });
	};
}

// The document is buffered through `</head>`, the part `transformIndexHtml` changes, and only that part is handed to
// it: a chunk may end mid-tag after it (BUGS.md B8). What follows, such as a deferred value, still streams in dev,
// through the same decoder, so a character split across the boundary arrives whole.
async function transformedHead(
	deps: DevDeps,
	shell: Shell,
	body: ReadableStream<Uint8Array>,
): Promise<ReadableStream<Uint8Array>> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let text = "";
	let close = -1;
	for (let step = await reader.read(); ; step = await reader.read()) {
		text += step.done ? decoder.decode() : decoder.decode(step.value, { stream: true });
		close = text.indexOf(HEAD_CLOSE);
		if (step.done || close !== -1) break;
	}
	const cut = close === -1 ? text.length : close + HEAD_CLOSE.length;
	const first = encoder.encode((await withVite(deps, shell, text.slice(0, cut))) + text.slice(cut));
	return new ReadableStream<Uint8Array>({
		start: (controller) => controller.enqueue(first),
		async pull(controller) {
			const next = await reader.read();
			const tail = next.done ? decoder.decode() : decoder.decode(next.value, { stream: true });
			if (tail !== "") controller.enqueue(encoder.encode(tail));
			if (next.done) controller.close();
		},
		cancel: (reason) => reader.cancel(reason),
	});
}

async function withVite(deps: DevDeps, shell: Shell, html: string): Promise<string> {
	const peeled: string[] = [];
	const marked = html
		.replace(INLINE, (tag) => `<!--flare-peel-${peeled.push(tag) - 1}-->`)
		.replace(HEAD_OPEN, (open) => `${open}${HEAD_MARK}`);
	const nonce = shell.nonce === undefined ? "" : `<meta property="csp-nonce" nonce="${shell.nonce}">`;
	const meta = `${nonce}${shell.token === undefined ? "" : tabMeta(shell.token)}`;
	const transformed = headTagsLast(await deps.transform(shell.url, marked)).replace("</head>", `${meta}</head>`);
	// A replacer function, so a `$` in a peeled tag is not read as a pattern.
	return peeled.reduce((out, tag, index) => out.replace(`<!--flare-peel-${index}-->`, () => tag), transformed);
}

function headTagsLast(html: string): string {
	return html
		.replace(PREPENDED, (_all: string, ...groups: string[]) => {
			const [open, added, rest, close] = groups;
			return [open, rest, added, close].join("");
		})
		.replace(HEAD_MARK, "");
}

// A path whose last segment has a dot is transformed as `/`, so Vite does not treat it as a file (B89).
function transformUrl(href: string): string {
	const url = new URL(href);
	const last = url.pathname.slice(url.pathname.lastIndexOf("/") + 1);
	return last.includes(".") ? "/" : `${url.pathname}${url.search}`;
}

async function loadEntry(server: DevServer, entry: string): Promise<AppServer> {
	const runner = server.environments.ssr.runner;
	if (runner === undefined) throw new Error("The SSR environment cannot run modules. Workers dev is unsupported");
	const loaded = (await runner.import(`/${entry}`))["server"];
	if (typeof loaded !== "object" || loaded === null || !("fetch" in loaded) || typeof loaded.fetch !== "function") {
		throw new Error(`${entry} exports no server`);
	}
	const fetch = loaded.fetch.bind(loaded);
	return { fetch: (request, env, ctx) => fetch(request, env, ctx) };
}

// A module that failed to load is a dev page with the message and the stack, and Vite's overlay opens in its tab.
function failed(error: unknown, token: string | undefined): Response {
	const { err } = overlayPayload(error);
	const tag = token === undefined ? "" : tabMeta(token);
	const body = `${tag}<pre>${escape(`${err.message}\n${err.stack}`)}</pre>`;
	return new Response(body, { status: 500, headers: { "content-type": "text/html; charset=utf-8" } });
}

function overlayPayload(error: unknown): { type: "error"; err: { message: string; stack: string } } {
	const thrown = error instanceof Error ? error : new Error(String(error));
	return { type: "error", err: { message: thrown.message, stack: thrown.stack ?? "" } };
}

function escape(text: string): string {
	return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
