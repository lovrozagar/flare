import { EventEmitter } from "node:events"
import * as nodeModule from "node:module"
import type { IncomingMessage, ServerResponse } from "node:http"
import type { ViteDevServer } from "vite"
import { expect, it, vi } from "vitest"
import { boot, type Boot } from "./boot.ts"
import { traceEnv } from "./e2e-env.ts"
import { connections, stalls, traceModules, traced } from "./trace.ts"

// A real vite dev server boots in a child process, as boot.test's cases do.
const VITE_BOOT = 30_000

const DOCUMENT = { accept: "text/html", "sec-fetch-dest": "document" }

// A dev boot under FLARE_E2E_TRACE as `value` gives, then the env as it was.
async function bootWith(value: string | undefined, runtime: string): Promise<Boot> {
	const before = process.env["FLARE_E2E_TRACE"]
	if (value === undefined) delete process.env["FLARE_E2E_TRACE"]
	else process.env["FLARE_E2E_TRACE"] = value
	try {
		return await boot({ app: "minimal", runtime, mode: "dev" })
	} finally {
		if (before === undefined) delete process.env["FLARE_E2E_TRACE"]
		else process.env["FLARE_E2E_TRACE"] = before
	}
}

// Unset, or anything but 1, the boot names no trace and the server logs no request: every run but CI's e2e jobs
// (BUGS.md 453).
it(
	"trace off",
	async () => {
		expect(traceEnv({})).toEqual({})
		expect(traceEnv({ FLARE_E2E_TRACE: "0" })).toEqual({})
		const session = await bootWith(undefined, "node")
		try {
			await (await fetch(`${session.origin}/`, { headers: DOCUMENT })).text()
			await (await fetch(`${session.origin}/@vite/client`)).text()
			expect(session.logs().filter((line) => line.includes("[trace]"))).toEqual([])
		} finally {
			await session.close()
		}
	},
	VITE_BOOT,
)

// FLARE_E2E_TRACE=1 names trace.ts by URL. A document's lifecycle is logged from its arrival to its close, and a module
// Vite serves is logged too: the trace's middleware runs ahead of Vite's own. /skeletons streams for over a second, so
// its head and first bytes go out between polls, well before it finishes.
it.each(["node", "bun"])(
	"trace on %s",
	async (runtime) => {
		expect(traceEnv({ FLARE_E2E_TRACE: "1" })).toEqual({
			FLARE_E2E_TRACE_PLUGIN: new URL("./trace.ts", import.meta.url).href,
		})
		const session = await bootWith("1", runtime)
		try {
			await (await fetch(`${session.origin}/skeletons`, { headers: DOCUMENT })).text()
			await (await fetch(`${session.origin}/@vite/client`)).text()
			const traced = (): string[] =>
				session
					.logs()
					.filter((line) => line.startsWith("[trace]"))
					.map((line) => line.replace(/^\[trace\] \d+ #\d+ /, ""))
			const closed = (): number => traced().filter((line) => line.includes(" close ")).length
			await expect.poll(closed).toBe(2)
			const page = traced()
				.filter((line) => line.startsWith("GET /skeletons "))
				// A slow runner can stretch the 900 ms between the two deferred values past the quiet bound.
				.filter((line) => !/ (quiet|resumed) /.test(line))
				.map((line) => line.replace(/(?<=finish 200 |bytes=)\d+$/, "N").replace(/(?<=arrived on s)\d+$/, "N"))
			expect(page).toEqual([
				"GET /skeletons arrived on sN",
				"GET /skeletons head 200",
				"GET /skeletons first bytes",
				"GET /skeletons finish 200 N",
				"GET /skeletons close finished=true head=true bytes=N",
			])
			const module = traced().filter((line) => line.startsWith("GET /@vite/client "))
			expect(module[0]).toMatch(/^GET \/@vite\/client arrived on s\d+$/)
			expect(module.at(-1)).toMatch(/^GET \/@vite\/client close finished=true head=true bytes=\d+$/)
			// Each request's socket was accepted, and closes with the requests it carried once the client lets go
			// (BUGS.md 504.14).
			const arrival = traced().find((line) => line.startsWith("GET /skeletons arrived on "))
			const socket = /arrived on (s\d+)$/.exec(arrival ?? "")?.[1] ?? ""
			const conn = (): string[] =>
				session
					.logs()
					.filter((line) => line.startsWith("[trace]"))
					.map((line) => line.replace(/^\[trace\] \d+ /, ""))
					.filter((line) => line.startsWith(`${socket} `))
			expect(conn()[0]).toBe(`${socket} accept`)
		} finally {
			await session.close()
		}
	},
	VITE_BOOT,
)

// The app's answers beyond documents, here a data request, log their head and first bytes too, and each module the
// server runtime asks Vite for is logged from the ask to the answer: in workerd that ask crosses the plugin's socket,
// so a request held on a module reads apart from one the app never answered (BUGS.md 504.8). The workers boot runs
// the page in workerd under Cloudflare's plugin, which needs node:module's registerHooks: the Bun run, whose child
// Vite is Bun too, skips it as boot.test does (B109).
it.each(["node", ...(typeof Reflect.get(nodeModule, "registerHooks") === "function" ? ["workers"] : [])])(
	"trace answers on %s",
	async (runtime) => {
		const session = await bootWith("1", runtime)
		try {
			await (await fetch(`${session.origin}/skeletons?_flare=data`)).text()
			const traced = (): string[] =>
				session
					.logs()
					.filter((line) => line.startsWith("[trace]"))
					.map((line) => line.replace(/^\[trace\] \d+ /, ""))
			await expect.poll(() => traced().filter((line) => line.includes("?_flare=data close")).length).toBe(1)
			const data = traced()
				.filter((line) => line.includes(" GET /skeletons?_flare=data "))
				.filter((line) => !/ (quiet|resumed) /.test(line))
				.map((line) =>
					line
						.replace(/^#\d+ /, "")
						.replace(/(?<=finish 200 |bytes=)\d+$/, "N")
						.replace(/(?<=arrived on s)\d+$/, "N"),
				)
			expect(data).toEqual([
				"GET /skeletons?_flare=data arrived on sN",
				"GET /skeletons?_flare=data head 200",
				"GET /skeletons?_flare=data first bytes",
				"GET /skeletons?_flare=data finish 200 N",
				"GET /skeletons?_flare=data close finished=true head=true bytes=N",
			])
			const page = traced().filter((line) => / ssr \S*skeletons\.page\.tsx /.test(line))
			expect(page.map((line) => line.replace(/^m\d+ ssr \S+ /, "").replace(/\d+ ms$/, "N ms"))).toEqual([
				"asked",
				"answered N ms",
			])
		} finally {
			await session.close()
		}
	},
	VITE_BOOT,
)

type Fake = { req: IncomingMessage; res: ServerResponse & { sent: (bytes: number) => void } }

// A request and its answer, as the middleware sees them: the socket counts the bytes `sent` writes.
function fakeExchange(url: string, headers: Record<string, string> = {}): Fake {
	const socket = { bytesWritten: 0 }
	const res = Object.assign(new EventEmitter(), {
		headersSent: false,
		statusCode: 200,
		writableFinished: false,
		sent(bytes: number) {
			res.headersSent = true
			socket.bytesWritten += bytes
		},
	})
	const req = { method: "GET", url, headers, socket }
	return { req: req as unknown as IncomingMessage, res: res as unknown as Fake["res"] }
}

// A streamed answer that goes quiet for a second after its head logs `quiet` with the bytes so far, and `resumed`
// with how long it was quiet once bytes flow again: a server function's stream here (BUGS.md 504.8). A module stays
// unpolled.
it("trace quiet stream", () => {
	vi.useFakeTimers()
	try {
		const lines: string[] = []
		const middleware = traced(
			(line) => lines.push(line),
			() => Date.now(),
		)
		const feed = fakeExchange("/app/_flare/fn/abc?_b=dev")
		const module = fakeExchange("/src/fns/activity.ts")
		middleware(feed.req, feed.res, () => undefined)
		middleware(module.req, module.res, () => undefined)
		feed.res.sent(100)
		module.res.sent(50)
		vi.advanceTimersByTime(999)
		expect(lines.filter((line) => line.includes(" quiet "))).toEqual([])
		vi.advanceTimersByTime(10)
		feed.res.sent(20)
		vi.advanceTimersByTime(2500)
		feed.res.sent(30)
		vi.advanceTimersByTime(10)
		feed.res.emit("close")
		const stamped = lines.map((line) => line.replace(/^\[trace\] \d+ /, ""))
		expect(stamped).toEqual([
			"#1 GET /app/_flare/fn/abc?_b=dev arrived on s?",
			"#2 GET /src/fns/activity.ts arrived on s?",
			"#1 GET /app/_flare/fn/abc?_b=dev head 200",
			"#1 GET /app/_flare/fn/abc?_b=dev first bytes",
			"#1 GET /app/_flare/fn/abc?_b=dev quiet 100",
			"#1 GET /app/_flare/fn/abc?_b=dev resumed 120 after 1008 ms",
			"#1 GET /app/_flare/fn/abc?_b=dev quiet 120",
			"#1 GET /app/_flare/fn/abc?_b=dev resumed 150 after 2500 ms",
			"#1 GET /app/_flare/fn/abc?_b=dev close finished=false head=true bytes=150",
		])
	} finally {
		vi.useRealTimers()
	}
})

// Each socket the server accepts is numbered and logged from its accept to its close, with the requests it carried and
// the bytes it read and wrote; each request names its socket. A socket that read more than its requests' bytes carried
// one the server never parsed (BUGS.md 504.14).
it("trace sockets", () => {
	const lines: string[] = []
	let clock = 0
	const conns = connections(
		(line) => lines.push(line),
		() => clock,
	)
	const middleware = traced(
		(line) => lines.push(line),
		() => clock,
		conns,
	)
	const socket = Object.assign(new EventEmitter(), { bytesRead: 0, bytesWritten: 0 })
	const other = Object.assign(new EventEmitter(), { bytesRead: 0, bytesWritten: 0 })
	conns.accept(socket as never)
	conns.accept(other as never)
	clock = 5
	for (const url of ["/a", "/b"]) {
		const exchange = fakeExchange(url)
		Object.assign(exchange.req, { socket })
		middleware(exchange.req, exchange.res, () => undefined)
	}
	const unknown = fakeExchange("/c")
	middleware(unknown.req, unknown.res, () => undefined)
	clock = 40
	Object.assign(socket, { bytesRead: 812, bytesWritten: 9000 })
	socket.emit("end")
	socket.emit("error", Object.assign(new Error("reset"), { code: "ECONNRESET" }))
	socket.emit("close")
	other.emit("error", new Error("gone"))
	expect(lines).toEqual([
		"[trace] 0 s1 accept",
		"[trace] 0 s2 accept",
		"[trace] 5 #1 GET /a arrived on s1",
		"[trace] 5 #2 GET /b arrived on s1",
		"[trace] 5 #3 GET /c arrived on s?",
		"[trace] 40 s1 end",
		"[trace] 40 s1 error ECONNRESET",
		"[trace] 40 s1 close requests=2 read=812 written=9000",
		"[trace] 40 s2 error gone",
	])
})

// Each server environment's module fetch is logged, numbered on its own: asked, then answered or failed with the time
// it took. The client environment is not wrapped (BUGS.md 504.8).
it("trace module fetches", async () => {
	const lines: string[] = []
	let clock = 0
	const fetchModule = async (id: string): Promise<unknown> => {
		clock += 7
		if (id === "/b.ts") throw new Error("no such file")
		return { code: "" }
	}
	const client = { fetchModule }
	const ssr = { fetchModule }
	const server = { environments: { client, ssr } } as unknown as ViteDevServer
	traceModules(
		server,
		(line) => lines.push(line),
		() => clock,
	)
	await ssr.fetchModule("/a.ts")
	await expect(ssr.fetchModule("/b.ts")).rejects.toThrow("no such file")
	await client.fetchModule("/c.ts")
	expect(lines).toEqual([
		"[trace] 0 m1 ssr /a.ts asked",
		"[trace] 7 m1 ssr /a.ts answered 7 ms",
		"[trace] 7 m2 ssr /b.ts asked",
		"[trace] 14 m2 ssr /b.ts failed 7 ms: no such file",
	])
})

// The dev server's own event loop: a gap of half a second or more between ticks logs how long it was held, so a stall
// in Node reads apart from one in workerd (BUGS.md 504.8).
it("trace node stalls", () => {
	const lines: string[] = []
	const ticks: Array<() => void> = []
	let clock = 0
	const stop = stalls(
		(line) => lines.push(line),
		() => clock,
		(tick) => {
			ticks.push(tick)
			return () => undefined
		},
	)
	const tick = (at: number): void => {
		clock = at
		for (const run of ticks) run()
	}
	tick(100)
	tick(599)
	tick(1300)
	tick(1400)
	expect(lines).toEqual(["[trace] 1300 node stalled 701 ms"])
	stop()
})
