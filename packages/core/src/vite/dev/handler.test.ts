import { expect, it, vi } from "vitest"
import { devFetch, devListener, installDevHandler, type DevServer } from "./handler.ts"

type AppFetch = (request: Request) => Promise<Response>

function app(fetch: AppFetch) {
	return { fetch }
}

function html(body: string, headers: HeadersInit = {}): Response {
	return new Response(body, { headers: { "content-type": "text/html; charset=utf-8", ...headers } })
}

type Sent = {
	status?: number
	headers: Record<string, string | readonly string[]>
	chunks: Uint8Array[]
	ended: boolean
}

// A Node response the listener writes to. `close` fires before the finish to model a client abort.
function response() {
	const sent: Sent = { headers: {}, chunks: [], ended: false }
	const handlers: Record<string, () => void> = {}
	const res = {
		writableFinished: false,
		writeHead: (status: number) => void (sent.status = status),
		setHeader: (name: string, value: string | readonly string[]) => void (sent.headers[name] = value),
		write: (chunk: Uint8Array) => {
			sent.chunks.push(chunk)
			return true
		},
		end: () => {
			sent.ended = true
			res.writableFinished = true
		},
		once: (event: "drain" | "close", callback: () => void) => void (handlers[event] = callback),
		destroy: vi.fn<() => void>(),
	}
	return { res, sent, close: () => handlers.close?.() }
}

function request(url: string) {
	return { method: "GET", url, headers: { host: "127.0.0.1" } }
}

async function settled(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0))
}

it("stream", async () => {
	const cancel = vi.fn<() => void>()
	const encoder = new TextEncoder()
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoder.encode("first"))
		},
		cancel,
	})
	const listener = devListener({
		load: async () => app(async () => new Response(body, { headers: { "content-type": "application/x-ndjson" } })),
	})
	const { res, sent, close } = response()
	listener(request("/about?_flare=data"), res)
	await settled()
	expect(new TextDecoder().decode(sent.chunks[0])).toBe("first")
	close()
	await settled()
	expect(cancel).toHaveBeenCalledOnce()
})

it("set-cookie", async () => {
	const headers = new Headers({ "content-type": "text/plain" })
	headers.append("set-cookie", "a=1")
	headers.append("set-cookie", "b=2")
	const listener = devListener({
		load: async () => app(async () => new Response("ok", { headers })),
	})
	const { res, sent } = response()
	listener(request("/"), res)
	await settled()
	expect(sent.headers["set-cookie"]).toEqual(["a=1", "b=2"])
	const cookied = devFetch({ load: async () => app(async () => html("<p>x</p>", { "set-cookie": "c=3" })) })
	expect((await cookied(new Request("http://localhost/"))).headers.getSetCookie()).toEqual(["c=3"])
})

it("load error", async () => {
	const report = vi.fn<(error: unknown, token: string | undefined) => void>()
	const fetch = devFetch({
		load: () => Promise.reject(new SyntaxError("Unexpected <token>")),
		report,
	})
	const answer = await fetch(new Request("http://localhost/"))
	expect(answer.status).toBe(500)
	expect(await answer.text()).toContain("Unexpected &lt;token&gt;")
	expect(report).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: "Unexpected <token>" }), undefined)
	const odd = devFetch({ load: () => Promise.reject("text"), report })
	expect(await (await odd(new Request("http://localhost/"))).text()).toContain("text")
	const bare = new Error("no stack")
	bare.stack = undefined
	const stackless = devFetch({ load: () => Promise.reject(bare), report })
	expect(await (await stackless(new Request("http://localhost/"))).text()).toBe("<pre>no stack\n</pre>")
	const broken = devListener({
		load: async () =>
			app(async () => new Response(new ReadableStream({ pull: () => Promise.reject(new Error("mid")) }))),
	})
	const written = response()
	broken(request("/"), written.res)
	await settled()
	expect(written.res.destroy).toHaveBeenCalledOnce()
})

type Tab = { send: (payload: unknown) => void }

function devServer(middlewareMode: boolean) {
	const listeners: Record<string, (payload: unknown) => void> = {}
	const clientListeners: Record<string, (payload: unknown, client: Tab) => void> = {}
	const used: unknown[] = []
	const server: DevServer = {
		config: { server: { middlewareMode } },
		middlewares: { use: (handler) => void used.push(handler) },
		environments: {
			ssr: {
				hot: { on: (event, listener) => void (listeners[event] = listener) },
				runner: { import: async () => ({ server: app(async () => html("<p>real</p>")) }) },
			},
			client: { hot: { on: (event, listener) => void (clientListeners[event] = listener) } },
		},
	}
	return { server, used, listeners, clientListeners }
}

it("middleware mode", async () => {
	const embedded = devServer(true)
	expect(installDevHandler(embedded.server, "src/server.ts")).toBeUndefined()
	expect(embedded.listeners).toEqual({})
	const own = devServer(false)
	const post = installDevHandler(own.server, "src/server.ts")
	expect(own.used).toEqual([])
	post?.()
	expect(own.used).toHaveLength(1)
	const handler = own.used[0]
	if (typeof handler !== "function") throw new Error("handler")
	const { res, sent } = response()
	handler(request("/"), res)
	await settled()
	expect(new TextDecoder().decode(sent.chunks[0])).toBe("<p>real</p>")
	const partial = response()
	handler({ headers: { accept: ["text/html", "*/*"], gone: undefined } }, partial.res)
	await settled()
	expect(new TextDecoder().decode(partial.sent.chunks[0])).toBe("<p>real</p>")
})

function tab(): Tab & { send: ReturnType<typeof vi.fn<(payload: unknown) => void>> } {
	return { send: vi.fn<(payload: unknown) => void>() }
}

const bug = { type: "error", err: { message: "boom", stack: "at x" } }

// An SSR payload carries the token of the tab whose request caused it, and only that tab gets it. A tab that
// disconnects gets nothing more (BUGS.md B38, B42).
it("other tab silent", () => {
	const { server, listeners, clientListeners } = devServer(false)
	installDevHandler(server, "src/server.ts")
	const [a, b] = [tab(), tab()]
	clientListeners["flare:tab"]?.({ token: "A" }, a)
	clientListeners["flare:tab"]?.({ token: "B" }, b)
	listeners["flare:error"]?.({ token: "A", payload: bug })
	expect(a.send).toHaveBeenCalledExactlyOnceWith(bug)
	expect(b.send).not.toHaveBeenCalled()
	clientListeners["vite:client:disconnect"]?.(undefined, a)
	listeners["flare:error"]?.({ token: "A", payload: bug })
	clientListeners["flare:tab"]?.({ token: 7 }, b)
	expect(a.send).toHaveBeenCalledOnce()
	expect(b.send).not.toHaveBeenCalled()
})

// A document's error comes before its tab connects: it waits for that token's announce, at most 30 s and 20
// payloads. A payload with no token reaches no tab. The handler mints the token, hands it to the app as a header,
// and writes it into the page it serves (dx/plugin.md, BUGS.md B42).
it("document error after connect", async () => {
	vi.useFakeTimers({ now: 0, toFake: ["Date"] })
	const { server, listeners, clientListeners } = devServer(false)
	installDevHandler(server, "src/server.ts")
	listeners["flare:error"]?.({ token: "late", payload: bug })
	listeners["flare:error"]?.({ token: "never", payload: bug })
	listeners["flare:error"]?.({ payload: bug })
	listeners["flare:error"]?.("not a message")
	const late = tab()
	clientListeners["flare:tab"]?.({ token: "late" }, late)
	expect(late.send).toHaveBeenCalledExactlyOnceWith(bug)
	vi.setSystemTime(30_001)
	const never = tab()
	clientListeners["flare:tab"]?.({ token: "never" }, never)
	expect(never.send).not.toHaveBeenCalled()
	for (let index = 0; index < 21; index += 1) listeners["flare:error"]?.({ token: "busy", payload: { n: index } })
	const busy = tab()
	clientListeners["flare:tab"]?.({ token: "busy" }, busy)
	expect(busy.send.mock.calls.map(([payload]) => payload)).toEqual(Array.from({ length: 20 }, (_, n) => ({ n: n + 1 })))
	vi.useRealTimers()
	const report = vi.fn<(error: unknown, token: string | undefined) => void>()
	const broken = devFetch({
		load: () => Promise.reject(new Error("no entry")),
		tab: () => "T2",
		report,
	})
	const failure = await (await broken(new Request("http://localhost/"))).text()
	expect(failure).toContain('<meta name="flare-dev-tab" content="T2">')
	expect(report).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: "no entry" }), "T2")
})

// A client's `flare:error` (a boundary error, an applied `e` frame) goes back to that tab only (BUGS.md B42).
it("client error relayed", () => {
	const { server, clientListeners } = devServer(false)
	installDevHandler(server, "src/server.ts")
	const payload = { type: "error", err: { message: "boom", stack: "at x" } }
	const tab = { send: vi.fn<(payload: unknown) => void>() }
	clientListeners["flare:error"]?.(payload, tab)
	expect(tab.send).toHaveBeenCalledExactlyOnceWith(payload)
})

it("entry export", async () => {
	const { server } = devServer(false)
	server.environments.ssr.runner = { import: async () => ({ other: 1 }) }
	const post = installDevHandler(server, "src/server.ts")
	const used: unknown[] = []
	server.middlewares.use = (handler) => void used.push(handler)
	post?.()
	const handler = used[0]
	if (typeof handler !== "function") throw new Error("handler")
	const { res, sent } = response()
	handler(request("/"), res)
	await settled()
	expect(sent.status).toBe(500)
	expect(new TextDecoder().decode(sent.chunks[0])).toContain("src/server.ts exports no server")
	delete server.environments.ssr.runner
	const bare = response()
	handler(request("/"), bare.res)
	await settled()
	expect(new TextDecoder().decode(bare.sent.chunks[0])).toContain("cannot run modules")
})

// The app's document reaches the client as the app wrote it, chunk by chunk: the server wrote the dev tags (B95 (b)).
it("document passes through", async () => {
	const encoder = new TextEncoder()
	const chunks = ['<html><head><script nonce="n">self.flare={}</script></head><body>a', "b</body></html>"]
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
			controller.close()
		},
	})
	const policy = { "content-type": "text/html", "content-security-policy": "script-src 'nonce-n'" }
	const fetch = devFetch({ load: async () => app(async () => new Response(body, { headers: policy })) })
	expect(await (await fetch(new Request("http://localhost/"))).text()).toBe(chunks.join(""))
})
