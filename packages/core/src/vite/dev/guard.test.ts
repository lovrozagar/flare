import { createServer } from "node:http"
import { connect } from "node:net"
import { expect, it } from "vitest"
import { flare } from "../plugin/flare.ts"
import { devEndpoints, guardDev, targetGuard } from "./guard.ts"

// A dev endpoint that answers with a CORS star, which the guard must not pass on.
const endpoint = guardDev(() => new Response("ran", { headers: { "access-control-allow-origin": "*", "x-kept": "1" } }))

function call(site?: string): Promise<Response> {
	const headers: Record<string, string> = site === undefined ? {} : { "sec-fetch-site": site }
	return endpoint(new Request("http://localhost/_flare/dev/x", { headers }))
}

it("same origin", async () => {
	const response = await call("same-origin")
	expect(response.status).toBe(200)
	expect(await response.text()).toBe("ran")
})

// A client that sends no fetch metadata, such as curl, is not a browser on another site.
it("missing site", async () => {
	expect(await (await call()).text()).toBe("ran")
})

it("same site", async () => {
	const response = await call("same-site")
	expect(response.status).toBe(403)
	expect(await response.text()).toBe("")
})

// A navigation typed into the address bar, or a bookmark.
it("none", async () => {
	expect((await call("none")).status).toBe(403)
})

it("cross site", async () => {
	expect((await call("cross-site")).status).toBe(403)
})

it("no star", async () => {
	const response = await call("same-origin")
	expect(response.headers.has("access-control-allow-origin")).toBe(false)
	expect(response.headers.get("x-kept")).toBe("1")
	const named = guardDev(() => new Response("", { headers: { "access-control-allow-origin": "http://localhost" } }))
	const kept = await named(new Request("http://localhost/x"))
	expect(kept.headers.get("access-control-allow-origin")).toBe("http://localhost")
})

// The endpoints exist only on the dev server: a build has no server, and the plugin applies to serve alone.
it("absent in prod", () => {
	const plugin = flare().find((item) => item.name === "flare:dev-endpoints")
	expect(plugin?.apply).toBe("serve")
	const used: Array<[string, unknown]> = []
	const server = { middlewares: { use: (path: string, handler: unknown) => void used.push([path, handler]) } }
	const hook = devEndpoints([{ path: "/_flare/dev/x", handle: () => new Response("ran") }]).configureServer
	if (typeof hook !== "function") throw new Error("configureServer")
	Reflect.apply(hook, null, [server])
	expect(used.map(([path]) => path)).toEqual(["/_flare/dev/x"])
	expect(typeof used[0]?.[1]).toBe("function")
})

// The status line for a target exactly as written, which a URL-parsing client would normalize away.
function statusOf(port: number, target: string): Promise<string> {
	return new Promise((resolve) => {
		const socket = connect(port, "127.0.0.1")
		let text = ""
		socket.on("data", (chunk: Buffer) => void (text += chunk.toString("latin1")))
		socket.on("close", () => resolve(text.split("\r\n")[0] ?? ""))
		socket.end(`GET ${target} HTTP/1.1\r\nhost: localhost\r\nconnection: close\r\n\r\n`)
	})
}

// On a real node:http server: every target the Node listener refuses is 400 before the next middleware, and every
// other reaches it untouched, an empty segment and a query's encoded slash included (B22, BUGS.md 118).
it("target guard", async () => {
	const seen: string[] = []
	const server = createServer((req, res) =>
		targetGuard(req, res, () => {
			seen.push(req.url ?? "")
			res.end("next")
		}),
	)
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
	const port = Number(Reflect.get(Object(server.address()), "port"))
	try {
		for (const target of ["//x", "/\\x", "http://evil.example/a"]) {
			expect(await statusOf(port, target)).toBe("HTTP/1.1 400 Bad Request")
		}
		// A backslash reads as `/` (B22, BUGS.md 163): `/a\\b` passes, and the plugin's URL parser reads it as `/a/b`.
		for (const target of ["/a//b", "/a?x=%2f", "/", "/a\\b"])
			expect(await statusOf(port, target)).toBe("HTTP/1.1 200 OK")
		expect(seen).toEqual(["/a//b", "/a?x=%2f", "/", "/a\\b"])
		// A request with no url, which node:http never makes, is the root.
		let passed = false
		targetGuard({}, { writeHead: () => undefined, end: () => undefined }, () => (passed = true))
		expect(passed).toBe(true)
	} finally {
		await new Promise((resolve) => server.close(resolve))
	}
})
