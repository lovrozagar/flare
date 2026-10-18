import { createServer as createHttpServer, request as httpRequest, type Server } from "node:http"
import { afterEach, expect, it, vi } from "vitest"
import { createBunFetch } from "../../src/adapters/bun/serve.ts"
import { createNodeListener } from "../../src/adapters/node/listener.ts"
import { createServer } from "../../src/server/lifecycle/create.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"
import { createRouter } from "../../src/shared/router/create-router.ts"

// The env the Node and Bun adapters hand the real `createServer` over real HTTP: `process.env` by default, or the
// `env` option's value, as the platform's env is on Workers (dx/adapters.md, BUGS.md 372).

const servers: Server[] = []

afterEach(async () => {
	vi.unstubAllEnvs()
	for (const server of servers.splice(0)) await new Promise((resolve) => server.close(resolve))
})

// The variable `/env` answers with, read from the env the server sees.
const ENV_KEY = "FLARE_ADAPTER_ENV"

function app(): ReturnType<typeof createServer> {
	const root = createRootLayout("_root_").render((props) => props.children)
	const env = createPage("_root_/env").response(({ env }) => new Response(String(Reflect.get(Object(env), ENV_KEY))))
	const routeTree = [{ id: "_root_/env", path: "/env", module: env }]
	return createServer({ router: createRouter({ layouts: { _root_: root }, routeTree }) })
}

async function listen(listener: ReturnType<typeof createNodeListener>): Promise<string> {
	const server = createHttpServer(listener)
	servers.push(server)
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
	const address = server.address()
	if (address === null || typeof address === "string") throw new Error("no port")
	return `http://127.0.0.1:${address.port}`
}

function text(url: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const call = httpRequest(url, (response) => {
			let body = ""
			response.on("data", (chunk: Buffer) => void (body += chunk.toString()))
			response.on("end", () => resolve(body))
		})
		call.on("error", reject)
		call.end()
	})
}

it("node env", async () => {
	vi.stubEnv(ENV_KEY, "from-process")
	expect(await text(`${await listen(createNodeListener(app()))}/env`)).toBe("from-process")
	expect(await text(`${await listen(createNodeListener(app(), { env: { [ENV_KEY]: "given" } }))}/env`)).toBe("given")
})

// The Bun runtime, present under `test:bun` only.
const bun: unknown = Reflect.get(globalThis, "Bun")

it.runIf(bun !== undefined)("bun env", async () => {
	vi.stubEnv(ENV_KEY, "from-process")
	for (const [fetcher, expected] of [
		[createBunFetch(app()), "from-process"],
		[createBunFetch(app(), { env: { [ENV_KEY]: "given" } }), "given"],
	] as const) {
		const served: unknown = Reflect.apply(Reflect.get(Object(bun), "serve"), bun, [
			{ hostname: "127.0.0.1", port: 0, ...fetcher },
		])
		try {
			expect(await text(`http://127.0.0.1:${Number(Reflect.get(Object(served), "port"))}/env`)).toBe(expected)
		} finally {
			await Reflect.apply(Reflect.get(Object(served), "stop"), served, [true])
		}
	}
})
