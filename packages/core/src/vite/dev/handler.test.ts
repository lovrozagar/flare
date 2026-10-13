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
	const report = vi.fn<(error: unknown) => void>();
	const fetch = devFetch({
		load: () => Promise.reject(new SyntaxError("Unexpected <token>")),
		transform: transform([]),
		report,
	});
	const answer = await fetch(new Request("http://localhost/"));
	expect(answer.status).toBe(500);
	expect(await answer.text()).toContain("Unexpected &lt;token&gt;");
	expect(report).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: "Unexpected <token>" }));
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

function devServer(middlewareMode: boolean) {
	const listeners: Record<string, (payload: unknown) => void> = {};
	const used: unknown[] = [];
	const server: DevServer = {
		config: { server: { middlewareMode } },
		middlewares: { use: (handler) => void used.push(handler) },
		transformIndexHtml: async (_url, input) => input,
		ws: { send: vi.fn<(payload: unknown) => void>() },
		environments: {
			ssr: {
				hot: { on: (event, listener) => void (listeners[event] = listener) },
				runner: { import: async () => ({ server: app(async () => html("<p>real</p>")) }) },
			},
		},
	};
	return { server, used, listeners };
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

it("error relay", () => {
	const { server, listeners } = devServer(false);
	installDevHandler(server, "src/server.ts");
	const payload = { type: "error", err: { message: "boom", stack: "at x" } };
	listeners["flare:error"]?.(payload);
	expect(server.ws.send).toHaveBeenCalledExactlyOnceWith(payload);
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
	expect(seen[0].html).toBe("<html><head><!--flare-head--><title>t</title></head><body>wait");
	later?.("DONE</body></html>");
	const second = await reader?.read();
	expect(new TextDecoder().decode(second?.value)).toBe("DONE</body></html>");
	expect((await reader?.read())?.done).toBe(true);
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
