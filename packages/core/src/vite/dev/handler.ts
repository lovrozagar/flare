import { createNodeListener } from "../../adapters/node/index.ts";

// What the handler needs from Vite's dev server. A real `ViteDevServer` is one. A test passes a small object.
export type DevServer = {
	config: { server: { middlewareMode?: unknown } };
	middlewares: { use(handler: (req: DevRequest, res: NodeResponse) => void): unknown };
	transformIndexHtml(url: string, html: string): Promise<string>;
	ws: { send(payload: unknown): void };
	environments: {
		ssr: {
			hot: { on(event: "flare:error", listener: (payload: unknown) => void): void };
			runner?: { import(id: string): Promise<Record<string, unknown>> };
		};
	};
};

// Node's IncomingMessage, as much of it as the listener reads.
export type DevRequest = {
	method?: string;
	url?: string;
	headers: Record<string, string | string[] | undefined>;
	readableEnded?: boolean;
	resume?(): void;
	on?(event: "data" | "end", listener: (chunk: Uint8Array) => void): unknown;
};

type Listener = ReturnType<typeof createNodeListener>;

type NodeResponse = Parameters<Listener>[1];

type AppServer = { fetch: (request: Request, env?: unknown, ctx?: unknown) => Promise<Response> | Response };

export type DevDeps = {
	load: () => Promise<AppServer>;
	transform: (url: string, html: string) => Promise<string>;
	report?: (error: unknown) => void;
};

// An inline script or style, one with no `src`. Vite would rewrite it, and a nonced inline tag must stay as the
// server wrote it.
const INLINE = /<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>|<style[^>]*>[\s\S]*?<\/style>/g;

// On Node and Bun, `vite dev` answers every request the Vite middlewares did not (B89). Embedded in another server,
// `middlewareMode`, it is not installed. The SSR graph's `flare:error` reaches Vite's overlay (B93).
export function installDevHandler(server: DevServer, entry: string): (() => void) | undefined {
	if (server.config.server.middlewareMode) return undefined;
	server.environments.ssr.hot.on("flare:error", (payload) => server.ws.send(payload));
	const listener = devListener({
		load: () => loadEntry(server, entry),
		transform: (url, html) => server.transformIndexHtml(url, html),
		report: (error) => server.ws.send(overlayPayload(error)),
	});
	// A post hook: Vite serves modules and assets first, and the app answers the rest.
	return () => server.middlewares.use((req, res) => listener(nodeRequest(req), res));
}

// The Node adapter's listener over the dev fetch: streaming, `Set-Cookie`, and a client abort as in production.
export function devListener(deps: DevDeps): ReturnType<typeof createNodeListener> {
	return createNodeListener({ fetch: devFetch(deps) });
}

// Repeated request headers join with ", " as fetch Headers would.
function nodeRequest(req: DevRequest): Parameters<Listener>[0] {
	const headers = Object.fromEntries(
		Object.entries(req.headers).flatMap(([name, value]) => (value === undefined ? [] : [[name, String(value)]])),
	);
	return {
		method: req.method ?? "GET",
		url: req.url ?? "/",
		headers,
		readableEnded: req.readableEnded,
		resume: req.resume?.bind(req),
		on: req.on?.bind(req),
	};
}

// HTML is buffered and goes through `transformIndexHtml` with its inline tags peeled. Other bodies stream.
export function devFetch(deps: DevDeps): (request: Request, env?: unknown, ctx?: unknown) => Promise<Response> {
	return async (request, env, ctx) => {
		let response: Response;
		try {
			response = await (await deps.load()).fetch(request, env, ctx);
		} catch (error) {
			deps.report?.(error);
			return failed(error);
		}
		if (!(response.headers.get("content-type") ?? "").startsWith("text/html") || response.body === null) {
			return response;
		}
		const headers = new Headers(response.headers);
		headers.delete("content-length");
		const body = await transformedHead(deps, transformUrl(request.url), response.body);
		return new Response(body, { status: response.status, headers });
	};
}

// The document is buffered through `</head>`, the part `transformIndexHtml` changes. What streams after the shell,
// such as a deferred value, still streams in dev.
async function transformedHead(
	deps: DevDeps,
	url: string,
	body: ReadableStream<Uint8Array>,
): Promise<ReadableStream<Uint8Array>> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let head = "";
	for (let step = await reader.read(); ; step = await reader.read()) {
		if (!step.done) head += decoder.decode(step.value, { stream: true });
		if (step.done || head.includes("</head>")) break;
	}
	const encoder = new TextEncoder();
	const first = encoder.encode(await withVite(deps, url, head));
	return new ReadableStream<Uint8Array>({
		start: (controller) => controller.enqueue(first),
		async pull(controller) {
			const next = await reader.read();
			if (next.done) controller.close();
			else controller.enqueue(next.value);
		},
		cancel: (reason) => reader.cancel(reason),
	});
}

async function withVite(deps: DevDeps, url: string, html: string): Promise<string> {
	const peeled: string[] = [];
	const marked = html.replace(INLINE, (tag) => `<!--flare-peel-${peeled.push(tag) - 1}-->`);
	const transformed = await deps.transform(url, marked);
	// A replacer function, so a `$` in a peeled tag is not read as a pattern.
	return peeled.reduce((out, tag, index) => out.replace(`<!--flare-peel-${index}-->`, () => tag), transformed);
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
	const loaded = (await runner.import(`/${entry}`)).server;
	if (typeof loaded !== "object" || loaded === null || !("fetch" in loaded) || typeof loaded.fetch !== "function") {
		throw new Error(`${entry} exports no server`);
	}
	const fetch = loaded.fetch.bind(loaded);
	return { fetch: (request, env, ctx) => fetch(request, env, ctx) };
}

// A module that failed to load is a dev page with the message and the stack, and Vite's overlay opens.
function failed(error: unknown): Response {
	const { err } = overlayPayload(error);
	const body = `<pre>${escape(`${err.message}\n${err.stack}`)}</pre>`;
	return new Response(body, { status: 500, headers: { "content-type": "text/html; charset=utf-8" } });
}

function overlayPayload(error: unknown): { type: "error"; err: { message: string; stack: string } } {
	const thrown = error instanceof Error ? error : new Error(String(error));
	return { type: "error", err: { message: thrown.message, stack: thrown.stack ?? "" } };
}

function escape(text: string): string {
	return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
