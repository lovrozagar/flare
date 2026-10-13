import { expect, it, vi } from "vitest";
import { devFetch, devListener, installDevHandler, type DevServer } from "./handler.ts";

type AppFetch = (request: Request) => Promise<Response>;

function app(fetch: AppFetch) {
	return { fetch };
}

function html(body: string, headers: HeadersInit = {}): Response {
	return new Response(body, { headers: { "content-type": "text/html; charset=utf-8", ...headers } });
}

const page =
	'<html><head><script nonce="n">self.flare={"a":1}</script><style>a{}</style><script src="/x.js"></script></head><body>hi</body></html>';

// transformIndexHtml as Vite runs it: it adds its client and may rewrite what it sees.
function transform(seen: { url: string; html: string }[]) {
	return async (url: string, input: string): Promise<string> => {
		seen.push({ url, html: input });
		return input.replace("<head>", '<head><script type="module" src="/@vite/client"></script>');
	};
}

type Sent = {
	status?: number;
	headers: Record<string, string | readonly string[]>;
	chunks: Uint8Array[];
	ended: boolean;
};

// A Node response the listener writes to. `close` fires before the finish to model a client abort.
function response() {
	const sent: Sent = { headers: {}, chunks: [], ended: false };
	const handlers: Record<string, () => void> = {};
	const res = {
		writableFinished: false,
		writeHead: (status: number) => void (sent.status = status),
		setHeader: (name: string, value: string | readonly string[]) => void (sent.headers[name] = value),
		write: (chunk: Uint8Array) => {
			sent.chunks.push(chunk);
			return true;
		},
		end: () => {
			sent.ended = true;
			res.writableFinished = true;
		},
		once: (event: "drain" | "close", callback: () => void) => void (handlers[event] = callback),
		destroy: vi.fn<() => void>(),
	};
	return { res, sent, close: () => handlers.close?.() };
}

function request(url: string) {
	return { method: "GET", url, headers: { host: "127.0.0.1" } };
}

async function settled(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

it("peel", async () => {
	const seen: { url: string; html: string }[] = [];
	const fetch = devFetch({ load: async () => app(async () => html(page)), transform: transform(seen) });
	const body = await (await fetch(new Request("http://localhost/about"))).text();
	expect(seen).toHaveLength(1);
	expect(seen[0].html).not.toContain("self.flare");
	expect(seen[0].html).not.toContain("a{}");
	expect(seen[0].html).toContain('<script src="/x.js"></script>');
	expect(body).toBe(
		'<html><head><script nonce="n">self.flare={"a":1}</script><style>a{}</style><script src="/x.js"></script><script type="module" src="/@vite/client"></script></head><body>hi</body></html>',
	);
});

// Vite's own head-prepend: its tags go right after the head open tag.
async function vite(_url: string, input: string): Promise<string> {
	return input.replace(/<head[^>]*>/, (open) => `${open}\n<script type="module" src="/@vite/client"></script>\n`);
}

// Vite prepends its tags to the head. A component the root layout renders in `<head>` hydrates by walking the head's
// children from the first, so the tags Vite adds go last, before `</head>`.
it("head order", async () => {
	const shell = '<html><head _hk=1><title _hk=2>T</title><link rel="icon" href="/i.png"></head><body>x</body></html>';
	const fetch = devFetch({ load: async () => app(async () => html(shell)), transform: vite });
	expect(await (await fetch(new Request("http://localhost/"))).text()).toBe(
		'<html><head _hk=1><title _hk=2>T</title><link rel="icon" href="/i.png">\n<script type="module" src="/@vite/client"></script>\n</head><body>x</body></html>',
	);
});

it("dot path", async () => {
	const seen: { url: string; html: string }[] = [];
	const fetch = devFetch({ load: async () => app(async () => html("<p>x</p>")), transform: transform(seen) });
	await fetch(new Request("http://localhost/files/report.txt"));
	await fetch(new Request("http://localhost/users/7?tab=a"));
	expect(seen.map((entry) => entry.url)).toEqual(["/", "/users/7?tab=a"]);
});

it("stream", async () => {
	const cancel = vi.fn<() => void>();
	const encoder = new TextEncoder();
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoder.encode("first"));
		},
		cancel,
	});
	const transformed = vi.fn<(url: string, input: string) => Promise<string>>();
	const listener = devListener({
		load: async () => app(async () => new Response(body, { headers: { "content-type": "application/x-ndjson" } })),
		transform: transformed,
	});
	const { res, sent, close } = response();
	listener(request("/about?_flare=data"), res);
	await settled();
	expect(new TextDecoder().decode(sent.chunks[0])).toBe("first");
	expect(transformed).not.toHaveBeenCalled();
	close();
	await settled();
	expect(cancel).toHaveBeenCalledOnce();
});

it("set-cookie", async () => {
	const headers = new Headers({ "content-type": "text/plain" });
	headers.append("set-cookie", "a=1");
	headers.append("set-cookie", "b=2");
	const listener = devListener({
		load: async () => app(async () => new Response("ok", { headers })),
		transform: transform([]),
	});
	const { res, sent } = response();
	listener(request("/"), res);
	await settled();
	expect(sent.headers["set-cookie"]).toEqual(["a=1", "b=2"]);
	const cookied = devFetch({
		load: async () => app(async () => html("<p>x</p>", { "set-cookie": "c=3" })),
		transform: transform([]),
	});
	expect((await cookied(new Request("http://localhost/"))).headers.getSetCookie()).toEqual(["c=3"]);
});

it("load error", async () => {
	const report = vi.fn<(error: unknown, token: string | undefined) => void>();
	const fetch = devFetch({
		load: () => Promise.reject(new SyntaxError("Unexpected <token>")),
		transform: transform([]),
		report,
	});
	const answer = await fetch(new Request("http://localhost/"));
	expect(answer.status).toBe(500);
	expect(await answer.text()).toContain("Unexpected &lt;token&gt;");
	expect(report).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: "Unexpected <token>" }), undefined);
	const odd = devFetch({ load: () => Promise.reject("text"), transform: transform([]), report });
	expect(await (await odd(new Request("http://localhost/"))).text()).toContain("text");
	const bare = new Error("no stack");
	bare.stack = undefined;
	const stackless = devFetch({ load: () => Promise.reject(bare), transform: transform([]), report });
	expect(await (await stackless(new Request("http://localhost/"))).text()).toBe("<pre>no stack\n</pre>");
	const broken = devListener({
		load: async () =>
			app(async () => new Response(new ReadableStream({ pull: () => Promise.reject(new Error("mid")) }))),
		transform: transform([]),
	});
	const written = response();
	broken(request("/"), written.res);
	await settled();
	expect(written.res.destroy).toHaveBeenCalledOnce();
});

type Tab = { send: (payload: unknown) => void };

function devServer(middlewareMode: boolean) {
	const listeners: Record<string, (payload: unknown) => void> = {};
	const clientListeners: Record<string, (payload: unknown, client: Tab) => void> = {};
	const used: unknown[] = [];
	const server: DevServer = {
		config: { server: { middlewareMode } },
		middlewares: { use: (handler) => void used.push(handler) },
		transformIndexHtml: async (_url, input) => input,
		environments: {
			ssr: {
				hot: { on: (event, listener) => void (listeners[event] = listener) },
				runner: { import: async () => ({ server: app(async () => html("<p>real</p>")) }) },
			},
			client: { hot: { on: (event, listener) => void (clientListeners[event] = listener) } },
		},
	};
	return { server, used, listeners, clientListeners };
}

it("middleware mode", async () => {
	const embedded = devServer(true);
	expect(installDevHandler(embedded.server, "src/server.ts")).toBeUndefined();
	expect(embedded.listeners).toEqual({});
	const own = devServer(false);
	const post = installDevHandler(own.server, "src/server.ts");
	expect(own.used).toEqual([]);
	post?.();
	expect(own.used).toHaveLength(1);
	const handler = own.used[0];
	if (typeof handler !== "function") throw new Error("handler");
	const { res, sent } = response();
	handler(request("/"), res);
	await settled();
	expect(new TextDecoder().decode(sent.chunks[0])).toBe("<p>real</p>");
	const partial = response();
	handler({ headers: { accept: ["text/html", "*/*"], gone: undefined } }, partial.res);
	await settled();
	expect(new TextDecoder().decode(partial.sent.chunks[0])).toBe("<p>real</p>");
});

function tab(): Tab & { send: ReturnType<typeof vi.fn<(payload: unknown) => void>> } {
	return { send: vi.fn<(payload: unknown) => void>() };
}

const bug = { type: "error", err: { message: "boom", stack: "at x" } };

// An SSR payload carries the token of the tab whose request caused it, and only that tab gets it. A tab that
// disconnects gets nothing more (BUGS.md B38, B42).
it("other tab silent", () => {
	const { server, listeners, clientListeners } = devServer(false);
	installDevHandler(server, "src/server.ts");
	const [a, b] = [tab(), tab()];
	clientListeners["flare:tab"]?.({ token: "A" }, a);
	clientListeners["flare:tab"]?.({ token: "B" }, b);
	listeners["flare:error"]?.({ token: "A", payload: bug });
	expect(a.send).toHaveBeenCalledExactlyOnceWith(bug);
	expect(b.send).not.toHaveBeenCalled();
	clientListeners["vite:client:disconnect"]?.(undefined, a);
	listeners["flare:error"]?.({ token: "A", payload: bug });
	clientListeners["flare:tab"]?.({ token: 7 }, b);
	expect(a.send).toHaveBeenCalledOnce();
	expect(b.send).not.toHaveBeenCalled();
});

// A document's error comes before its tab connects: it waits for that token's announce, at most 30 s and 20
// payloads. A payload with no token reaches no tab. The handler mints the token, hands it to the app as a header,
// and writes it into the page it serves (dx/plugin.md, BUGS.md B42).
it("document error after connect", async () => {
	vi.useFakeTimers({ now: 0, toFake: ["Date"] });
	const { server, listeners, clientListeners } = devServer(false);
	installDevHandler(server, "src/server.ts");
	listeners["flare:error"]?.({ token: "late", payload: bug });
	listeners["flare:error"]?.({ token: "never", payload: bug });
	listeners["flare:error"]?.({ payload: bug });
	listeners["flare:error"]?.("not a message");
	const late = tab();
	clientListeners["flare:tab"]?.({ token: "late" }, late);
	expect(late.send).toHaveBeenCalledExactlyOnceWith(bug);
	vi.setSystemTime(30_001);
	const never = tab();
	clientListeners["flare:tab"]?.({ token: "never" }, never);
	expect(never.send).not.toHaveBeenCalled();
	for (let index = 0; index < 21; index += 1) listeners["flare:error"]?.({ token: "busy", payload: { n: index } });
	const busy = tab();
	clientListeners["flare:tab"]?.({ token: "busy" }, busy);
	expect(busy.send.mock.calls.map(([payload]) => payload)).toEqual(
		Array.from({ length: 20 }, (_, n) => ({ n: n + 1 })),
	);
	vi.useRealTimers();
	const seen: string[] = [];
	const report = vi.fn<(error: unknown, token: string | undefined) => void>();
	const minted = devFetch({
		load: async () =>
			app(async (request) => html(`<html><head></head><body>${request.headers.get("flare-dev-tab")}</body></html>`)),
		transform: async (_url, input) => input,
		tab: () => "T1",
		report,
	});
	const served = await (await minted(new Request("http://localhost/"))).text();
	expect(served).toBe('<html><head><meta name="flare-dev-tab" content="T1"></head><body>T1</body></html>');
	const kept = await minted(new Request("http://localhost/x", { headers: { "flare-dev-tab": "T0" } }));
	seen.push(await kept.text());
	expect(seen[0]).toContain("<body>T0</body>");
	const broken = devFetch({
		load: () => Promise.reject(new Error("no entry")),
		transform: transform([]),
		tab: () => "T2",
		report,
	});
	const failure = await (await broken(new Request("http://localhost/"))).text();
	expect(failure).toContain('<meta name="flare-dev-tab" content="T2">');
	expect(report).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: "no entry" }), "T2");
});

// A client's `flare:error` (a boundary error, an applied `e` frame) goes back to that tab only (BUGS.md B42).
it("client error relayed", () => {
	const { server, clientListeners } = devServer(false);
	installDevHandler(server, "src/server.ts");
	const payload = { type: "error", err: { message: "boom", stack: "at x" } };
	const tab = { send: vi.fn<(payload: unknown) => void>() };
	clientListeners["flare:error"]?.(payload, tab);
	expect(tab.send).toHaveBeenCalledExactlyOnceWith(payload);
});

it("entry export", async () => {
	const { server } = devServer(false);
	server.environments.ssr.runner = { import: async () => ({ other: 1 }) };
	const post = installDevHandler(server, "src/server.ts");
	const used: unknown[] = [];
	server.middlewares.use = (handler) => void used.push(handler);
	post?.();
	const handler = used[0];
	if (typeof handler !== "function") throw new Error("handler");
	const { res, sent } = response();
	handler(request("/"), res);
	await settled();
	expect(sent.status).toBe(500);
	expect(new TextDecoder().decode(sent.chunks[0])).toContain("src/server.ts exports no server");
	delete server.environments.ssr.runner;
	const bare = response();
	handler(request("/"), bare.res);
	await settled();
	expect(new TextDecoder().decode(bare.sent.chunks[0])).toContain("cannot run modules");
});

it("streamed html", async () => {
	const encoder = new TextEncoder();
	let later: ((text: string) => void) | undefined;
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoder.encode("<html><head><title>t</title>"));
			controller.enqueue(encoder.encode("</head><body>wait"));
			later = (text) => {
				controller.enqueue(encoder.encode(text));
				controller.close();
			};
		},
	});
	const seen: { url: string; html: string }[] = [];
	const fetch = devFetch({
		load: async () => app(async () => new Response(body, { headers: { "content-type": "text/html" } })),
		transform: transform(seen),
	});
	const reader = (await fetch(new Request("http://localhost/"))).body?.getReader();
	const first = await reader?.read();
	expect(new TextDecoder().decode(first?.value)).toBe(
		'<html><head><title>t</title><script type="module" src="/@vite/client"></script></head><body>wait',
	);
	expect(seen[0].html).toBe("<html><head><!--flare-head--><title>t</title></head>");
	later?.("DONE</body></html>");
	const second = await reader?.read();
	expect(new TextDecoder().decode(second?.value)).toBe("DONE</body></html>");
	expect((await reader?.read())?.done).toBe(true);
});

// A body that streams its chunks, then closes.
function chunked(chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(chunk);
			controller.close();
		},
	});
}

// transformIndexHtml sees the document through `</head>` only, so a chunk that ends mid-tag after it is never handed
// to its HTML parser. The bytes after `</head>` reach the client unchanged (BUGS.md B8).
it("head split", async () => {
	const encoder = new TextEncoder();
	const seen: { url: string; html: string }[] = [];
	const body = chunked([
		encoder.encode('<html><head></head><body><a class="x opa'),
		encoder.encode('city-50">a</a></body></html>'),
	]);
	const fetch = devFetch({
		load: async () => app(async () => new Response(body, { headers: { "content-type": "text/html" } })),
		transform: transform(seen),
	});
	const text = await (await fetch(new Request("http://localhost/"))).text();
	expect(seen[0].html).toBe("<html><head><!--flare-head--></head>");
	expect(text).toBe(
		'<html><head><script type="module" src="/@vite/client"></script></head><body><a class="x opacity-50">a</a></body></html>',
	);
});

// A multibyte character split across the chunk that holds `</head>` arrives whole: the tail goes through the same
// decoder, flushed at the end (BUGS.md B8).
it("utf8 boundary", async () => {
	const bytes = new TextEncoder().encode("<html><head></head><body>é</body></html>");
	const at = bytes.indexOf(0xc3) + 1;
	const fetch = devFetch({
		load: async () =>
			app(
				async () =>
					new Response(chunked([bytes.slice(0, at), bytes.slice(at)]), { headers: { "content-type": "text/html" } }),
			),
		transform: async (_url, html) => html,
	});
	expect(await (await fetch(new Request("http://localhost/"))).text()).toBe("<html><head></head><body>é</body></html>");
});

it("html edges", async () => {
	const seen: { url: string; html: string }[] = [];
	const headless = devFetch({ load: async () => app(async () => html("<p>no head</p>")), transform: transform(seen) });
	expect(await (await headless(new Request("http://localhost/"))).text()).toBe("<p>no head</p>");
	expect(seen[0].html).toBe("<p>no head</p>");
	const empty = devFetch({
		load: async () => app(async () => new Response(null, { status: 204, headers: { "content-type": "text/html" } })),
		transform: transform(seen),
	});
	expect((await empty(new Request("http://localhost/"))).status).toBe(204);
	expect(seen).toHaveLength(1);
	const cancel = vi.fn<(reason: unknown) => void>();
	const encoder = new TextEncoder();
	const open = new ReadableStream<Uint8Array>({
		start: (controller) => controller.enqueue(encoder.encode("<html><head></head><body>")),
		cancel,
	});
	const streaming = devFetch({
		load: async () => app(async () => new Response(open, { headers: { "content-type": "text/html" } })),
		transform: transform(seen),
	});
	const body = (await streaming(new Request("http://localhost/"))).body;
	await body?.cancel("gone");
	expect(cancel).toHaveBeenCalledExactlyOnceWith("gone");
});

// Vite's client reads the nonce from this meta for the styles it injects and its error overlay, so a nonce CSP does
// not block them. A response with no nonce policy gets none.
it("csp nonce", async () => {
	const policy = "script-src 'self' 'nonce-abc123'; style-src-elem 'self' 'nonce-abc123'";
	const nonced = devFetch({
		load: async () => app(async () => html(page, { "content-security-policy": policy })),
		transform: transform([]),
	});
	const text = await (await nonced(new Request("http://127.0.0.1/"))).text();
	expect(text).toContain(
		'<script type="module" src="/@vite/client"></script><meta property="csp-nonce" nonce="abc123"></head>',
	);
	const bare = devFetch({ load: async () => app(async () => html(page)), transform: transform([]) });
	expect(await (await bare(new Request("http://127.0.0.1/"))).text()).not.toContain("csp-nonce");
});
