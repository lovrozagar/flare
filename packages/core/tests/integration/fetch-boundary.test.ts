import { afterEach, expect, it, vi } from "vitest"
import type { DevErrorPayload } from "../../src/shared/errors/dev-report.ts"
import { createServer, serveWith } from "../../src/server/lifecycle/create.ts"
import type { Logger } from "../../src/server/lifecycle/logger.ts"
import { mount } from "../../src/server/mount/index.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"
import { createRouter } from "../../src/shared/router/create-router.ts"

// One error boundary at `server.fetch`: an app callback that fails anywhere is logged once and answered as the 500
// every exit shares, with the security headers, never a rejected fetch, which Node sends as a bare unlogged 500 and
// Workers as error 1101 (plan 21 9.1, BUGS.md 202). The adapters only hand the server's answer on, so this one
// boundary holds on Node, Bun, and Workers.

afterEach(() => {
	vi.restoreAllMocks()
})

const root = createRootLayout("_root_").render((props) => props.children)
const big = createPage("_root_/big")
	.loader(() => ({ n: 1n }))
	.render(() => "big")
const router = createRouter({
	layouts: { _root_: root },
	routeTree: [
		{ id: "_root_/", path: "/", module: createPage("_root_/").render(() => "home") },
		{ id: "_root_/big", path: "/big", module: big },
	],
})

type Case = { name: string; options: object; request: Request; logged: RegExp }

const CASES: readonly Case[] = [
	{
		name: "server function module",
		options: {
			serverFns: {
				broken0123456789: async () => {
					throw new Error("import boom")
				},
			},
		},
		request: new Request("http://localhost/_flare/fn/broken0123456789", {
			method: "POST",
			headers: { origin: "http://localhost" },
		}),
		logged: /import boom/,
	},
	{
		name: "mount answer",
		options: { mounts: [mount("/m", () => undefined as never)] },
		request: new Request("http://localhost/m/x"),
		logged: /mount \/m answered undefined, not a Response/,
	},
	{
		name: "data serialization",
		options: {},
		request: new Request("http://localhost/big?_flare=data"),
		logged: /BigInt/,
	},
	{
		name: "server context",
		options: {
			serverContext: () => {
				throw new Error("context boom")
			},
		},
		request: new Request("http://localhost/"),
		logged: /context boom/,
	},
]

it.each(CASES)("$name", async ({ options, request, logged }) => {
	const errors = vi.spyOn(console, "error").mockImplementation(() => undefined)
	const response = await createServer({ router, ...options } as Parameters<typeof createServer>[0]).fetch(request)
	expect(response.status).toBe(500)
	expect(response.headers.get("x-content-type-options")).toBe("nosniff")
	expect(errors).toHaveBeenCalledOnce()
	expect(errors.mock.calls.flat().map(String).join(" ")).toMatch(logged)
})

function authenticate(): never {
	throw new Error("auth boom")
}

// A throwing `authenticate` on a page is no silent 500: it is logged, and in dev the overlay gets it, on a document
// and on a navigation alike (plan 21 9.2, held since BUGS.md 157).
it("authenticate throw", async () => {
	const gated = createPage("_root_/gated")
		.authenticate()
		.render(() => "gated")
	const routes = createRouter({
		layouts: { _root_: root },
		routeTree: [{ id: "_root_/gated", path: "/gated", module: gated }],
	})
	const send = vi.fn<(payload: DevErrorPayload) => void>()
	const error = vi.fn<Logger["error"]>()
	const log: Logger = { level: "error", error, warn: () => undefined, log: () => undefined }
	const server = serveWith({ router: routes, authenticate }, { dev: true, send, log })
	for (const path of ["/gated", "/gated?_flare=data"]) {
		expect((await server.fetch(new Request(`http://localhost${path}`))).status).toBe(500)
	}
	expect(send).toHaveBeenCalledTimes(2)
	expect(send.mock.calls.map(([payload]) => payload.err.message)).toEqual(["auth boom", "auth boom"])
	expect(error).toHaveBeenCalledTimes(2)
})
