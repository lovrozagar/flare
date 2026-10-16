import { createServer as createHttpServer, request as httpRequest, type Server } from "node:http"
import { gunzipSync, gzipSync } from "node:zlib"
import { afterEach, expect, it } from "vitest"
import { createBunFetch } from "../../src/adapters/bun/serve.ts"
import { createNodeListener } from "../../src/adapters/node/listener.ts"
import { createServer } from "../../src/server/lifecycle/create.ts"
import { createMiddleware } from "../../src/server/middleware/index.ts"
import { mount } from "../../src/server/mount/index.ts"
import { createServerFn } from "../../src/server/server-fn/dispatch.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"
import { createRouter } from "../../src/shared/router/create-router.ts"

// A Response a `.response()` route, a server function, a middleware, or a mount got from `fetch()` and returns as-is:
// the platform's fetch already decoded a gzip body, so the answer drops the upstream's Content-Encoding and Content-Length and the client
// reads the body intact on every adapter. A Response the app built from compressed bytes keeps its encoding
// (plan 21 8.8). workerd runs the same case in tests/workerd/server.test.ts.

const BODY = "intact body ".repeat(64)
const FN_ID = "gzipfn0123456789"
const servers: Server[] = []

afterEach(async () => {
	for (const server of servers.splice(0)) await new Promise((resolve) => server.close(resolve))
})

async function listen(server: Server): Promise<string> {
	servers.push(server)
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
	const address = server.address()
	if (address === null || typeof address === "string") throw new Error("no port")
	return `http://127.0.0.1:${address.port}`
}

// An upstream that always answers gzip, with the compressed length.
function upstream(): Promise<string> {
	const zipped = gzipSync(BODY)
	return listen(
		createHttpServer((_, response) => {
			response.writeHead(200, {
				"content-type": "text/plain",
				"content-encoding": "gzip",
				"content-length": String(zipped.length),
			})
			response.end(zipped)
		}),
	)
}

function app(origin: string): ReturnType<typeof createServer> {
	const root = createRootLayout("_root_").render((props) => props.children)
	const relayed = createPage("_root_/relayed").response(() => fetch(origin))
	const built = createPage("_root_/built").response(
		() => new Response(gzipSync(BODY), { headers: { "content-type": "text/plain", "content-encoding": "gzip" } }),
	)
	const fn = createServerFn({ method: "get", __id: FN_ID, __name: "relay" } as never).handler(() => fetch(origin))
	const routeTree = [
		{ id: "_root_/relayed", path: "/relayed", module: relayed },
		{ id: "_root_/built", path: "/built", module: built },
	]
	const relay = createMiddleware((ctx) =>
		new URL(ctx.request.url).pathname === "/middleware" ? fetch(origin) : ctx.next(),
	)
	return createServer({
		router: createRouter({ layouts: { _root_: root }, routeTree }),
		serverFns: { [FN_ID]: async () => fn },
		middleware: [relay],
		mounts: [mount("/mounted", () => fetch(origin))],
	} as Parameters<typeof createServer>[0])
}

type Raw = { encoding: string | undefined; body: Buffer }

// A plain HTTP read: no Accept-Encoding and no decoding, so the bytes are what the server wrote.
function read(url: string): Promise<Raw> {
	return new Promise((resolve, reject) => {
		const call = httpRequest(url, { headers: { origin: new URL(url).origin } }, (response) => {
			const chunks: Buffer[] = []
			response.on("data", (chunk: Buffer) => void chunks.push(chunk))
			response.on("end", () => resolve({ encoding: response.headers["content-encoding"], body: Buffer.concat(chunks) }))
			response.on("error", reject)
		})
		call.on("error", reject)
		call.end()
	})
}

async function answers(origin: string): Promise<unknown[]> {
	const relayed = await read(`${origin}/relayed`)
	const fn = await read(`${origin}/_flare/fn/${FN_ID}`)
	const middleware = await read(`${origin}/middleware`)
	const mounted = await read(`${origin}/mounted`)
	const built = await read(`${origin}/built`)
	return [
		[relayed.encoding, relayed.body.toString()],
		[fn.encoding, fn.body.toString()],
		[middleware.encoding, middleware.body.toString()],
		[mounted.encoding, mounted.body.toString()],
		[built.encoding, gunzipSync(built.body).toString()],
	]
}

const EXPECTED = [
	[undefined, BODY],
	[undefined, BODY],
	[undefined, BODY],
	[undefined, BODY],
	["gzip", BODY],
]

it("node fetched", async () => {
	const origin = await listen(createHttpServer(createNodeListener(app(await upstream()))))
	expect(await answers(origin)).toEqual(EXPECTED)
})

// The Bun runtime, present under `test:bun` only.
const bun: unknown = Reflect.get(globalThis, "Bun")

it.runIf(bun !== undefined)("bun fetched", async () => {
	const fetcher = createBunFetch(app(await upstream()))
	const served: unknown = Reflect.apply(Reflect.get(Object(bun), "serve"), bun, [
		{ hostname: "127.0.0.1", port: 0, ...fetcher },
	])
	try {
		expect(await answers(`http://127.0.0.1:${Number(Reflect.get(Object(served), "port"))}`)).toEqual(EXPECTED)
	} finally {
		await Reflect.apply(Reflect.get(Object(served), "stop"), served, [true])
	}
})
