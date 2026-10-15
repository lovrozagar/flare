import http from "node:http"
import { createComponent, type Element } from "solid-js"
import { Dynamic } from "@solidjs/web"
import net from "node:net"
import { afterAll, beforeAll, expect, it } from "vitest"
import { createNodeListener } from "../../src/adapters/node/listener.ts"
import { createServer, serveWith } from "../../src/server/lifecycle/create.ts"
import type { Logger } from "../../src/server/lifecycle/logger.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"
import { createRouter, type RouteModule } from "../../src/shared/router/create-router.ts"

const home = createPage("_root_/")
	.loader(() => ({ title: "Home" }))
	.render((props) =>
		typeof props.loaderData === "object" && props.loaderData !== null && "title" in props.loaderData
			? String(props.loaderData.title)
			: "",
	)
const router = createRouter({
	layouts: { _root_: createRootLayout("_root_").render((props) => documentOf(props.children)) },
	routeTree: [{ id: "_root_/", path: "/", module: home }],
})
// Production ingress: the dev sink would drop HSTS and COOP for Vite's dev server (csp.ts).
const quiet: Logger = { level: "error", error: () => undefined, warn: () => undefined, log: () => undefined }
const app = serveWith({ router }, { dev: false, log: quiet })
let fetches = 0
const listener = createNodeListener({
	fetch(request) {
		fetches += 1
		return app.fetch(request)
	},
})
const server = http.createServer((req, res) => {
	listener(nodeReq(req), nodeRes(res))
})

let port = 0

beforeAll(async () => {
	port = await listen(server)
})

afterAll(() => {
	server.close()
})

const HOSTILE = ["//evil/", "/\\evil", "http://evil/", "/a\u0001"]

it("preview is not required", async () => {
	const ok = await fetchPath({ port, method: "GET", path: "/" })
	expect(ok.status).toBe(200)
	expect(ok.body).toContain("Home")
	expectSecurity(ok.headers)
	const missing = await fetchPath({ port, method: "GET", path: "/nope" })
	expect(missing.status).toBe(404)
	expectSecurity(missing.headers)
})

it("hostile table", async () => {
	fetches = 0
	for (const path of HOSTILE) {
		const response = await fetchPath({ port, method: "GET", path })
		expect(response.status).toBe(400)
	}
	expect(fetches).toBe(0)
})

function expectSecurity(headers: http.IncomingHttpHeaders): void {
	expect(headers["x-content-type-options"]).toBe("nosniff")
	expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin")
	expect(headers["x-frame-options"]).toBe("DENY")
	expect(headers["cross-origin-opener-policy"]).toBe("same-origin")
	expect(headers["strict-transport-security"]).toBeUndefined()
	expect(headers["x-powered-by"]).toBeUndefined()
}

function listen(target: http.Server): Promise<number> {
	return new Promise((resolve) => {
		target.listen(0, "127.0.0.1", () => {
			const address = target.address()
			if (address === null || typeof address === "string") throw new Error("port")
			resolve(address.port)
		})
	})
}

function fetchPath(input: { port: number; method: string; path: string }): Promise<{
	status: number
	body: string
	headers: http.IncomingHttpHeaders
}> {
	return new Promise((resolve, reject) => {
		const socket = net.connect(input.port, "127.0.0.1", () => {
			socket.write(`${input.method} ${input.path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`)
		})
		const chunks: Buffer[] = []
		socket.on("data", (chunk: Buffer) => chunks.push(chunk))
		socket.on("error", reject)
		socket.on("end", () => {
			const raw = Buffer.concat(chunks).toString()
			const headerEnd = raw.indexOf("\r\n\r\n")
			const head = headerEnd === -1 ? raw : raw.slice(0, headerEnd)
			const lines = head.split("\r\n")
			const statusLine = lines[0] ?? ""
			const status = Number(statusLine.split(" ")[1])
			const headers: http.IncomingHttpHeaders = {}
			for (const line of lines.slice(1)) {
				const split = line.indexOf(":")
				if (split === -1) continue
				headers[line.slice(0, split).trim().toLowerCase()] = line.slice(split + 1).trim()
			}
			resolve({ status, body: headerEnd === -1 ? "" : raw.slice(headerEnd + 4), headers })
		})
	})
}

function nodeReq(req: http.IncomingMessage) {
	return {
		method: req.method ?? "GET",
		url: req.url ?? "/",
		headers: headerRecord(req.headers),
		resume() {
			req.resume()
		},
		on(event: "data" | "end", listener: (chunk: Uint8Array) => void) {
			if (event === "end") req.on("end", () => listener(new Uint8Array()))
			else req.on("data", (chunk: Buffer) => listener(chunk))
		},
		get readableEnded() {
			return req.readableEnded
		},
	}
}

function nodeRes(res: http.ServerResponse) {
	return {
		writeHead(status: number) {
			res.writeHead(status)
		},
		setHeader(name: string, value: string | readonly string[]) {
			res.setHeader(name, value)
		},
		write(chunk: Uint8Array) {
			return res.write(chunk)
		},
		end() {
			res.end()
		},
		once(event: "drain" | "close", callback: () => void) {
			res.once(event, callback)
		},
		get writableFinished() {
			return res.writableFinished
		},
	}
}

function headerRecord(headers: http.IncomingHttpHeaders): Record<string, string> {
	const out: Record<string, string> = {}
	for (const [name, value] of Object.entries(headers)) {
		if (typeof value === "string") out[name] = value
	}
	return out
}

// A page's `.headers()` reach the document and its data response, and the security set still wins over them.
it("headers cannot secure", async () => {
	const page = createPage("_root_/")
		.headers(() => ({
			"Content-Security-Policy": "default-src *",
			"X-Frame-Options": "ALLOWALL",
			"x-route": "1",
			"set-cookie": ["a=1", "b=2"],
		}))
		.render(() => "home")
	const secured = createServer({
		router: createRouter({
			layouts: { _root_: createRootLayout("_root_").render((props) => props.children) },
			routeTree: [{ id: "_root_/", path: "/", module: page }],
		}),
	})
	for (const path of ["/", "/?_flare=data"]) {
		const response = await secured.fetch(new Request(`http://localhost${path}`))
		expect(response.headers.get("content-security-policy")).not.toBe("default-src *")
		expect(response.headers.get("x-frame-options")).not.toBe("ALLOWALL")
		expect(response.headers.get("x-route")).toBe("1")
		expect(response.headers.getSetCookie()).toEqual(["a=1", "b=2"])
	}
})

// Solid writes the head into the document's head element, so the root renders a full document.
function documentOf(children: Element): Element {
	return createComponent(Dynamic, {
		component: "html",
		get children() {
			return [
				createComponent(Dynamic, { component: "head" }),
				createComponent(Dynamic, { component: "body", children }),
			]
		},
	})
}

function serveOne(page: RouteModule, id = "_root_/"): ReturnType<typeof createServer> {
	return createServer({
		router: createRouter({
			layouts: { _root_: createRootLayout("_root_").render((props) => documentOf(props.children)) },
			routeTree: [{ id, path: "/", module: page }],
		}),
	})
}

// A page's `.security()` reaches its document and its data response. `false` removes a header.
it("route security", async () => {
	const framed = serveOne(
		createPage("_root_/")
			.security({ "X-Frame-Options": "SAMEORIGIN" })
			.render(() => "home"),
	)
	for (const path of ["/", "/?_flare=data"]) {
		expect((await framed.fetch(new Request(`http://localhost${path}`))).headers.get("x-frame-options")).toBe(
			"SAMEORIGIN",
		)
	}
	const open = serveOne(
		createPage("_root_/")
			.security({ "X-Frame-Options": false })
			.render(() => "home"),
	)
	expect((await open.fetch(new Request("http://localhost/"))).headers.has("x-frame-options")).toBe(false)
})

// A string CSP is the header as written, and no script or style tag carries a nonce (B68).
it("route string csp", async () => {
	const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'"
	const page = createPage("_root_/")
		.head(() => ({ custom: { styles: [{ children: "p{}" }] } }))
		.security({ "Content-Security-Policy": csp })
		.render(() => "home")
	const response = await serveOne(page).fetch(new Request("http://localhost/"))
	expect(response.headers.get("content-security-policy")).toBe(csp)
	const html = await response.text()
	expect(html).toMatch(/<script/)
	expect(html).toMatch(/<style/)
	expect(html).not.toMatch(/<(script|style)\b[^>]*\bnonce=/)
})
