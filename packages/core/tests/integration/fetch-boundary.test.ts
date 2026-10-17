import { createComponent } from "solid-js"
import { Dynamic } from "@solidjs/web"
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
	vi.unstubAllEnvs()
})

const root = createRootLayout("_root_").render((props) => props.children)
const big = createPage("_root_/big")
	// A function is no wire value (B145).
	.loader(() => ({ n: () => 1 }))
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
		logged: /Seroval/,
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

// A render that throws before the shell, with no boundary to catch it, answers the built-in error page with its
// status, never a blank body: the generic message and the digest in production. A root that renders no document
// answers the same page, its own log line naming it (plan 21 13.13, BUGS.md 215).
it("render before the shell", async () => {
	vi.spyOn(console, "error").mockImplementation(() => undefined)
	vi.stubEnv("DEV", false)
	vi.stubEnv("PROD", true)
	const broken = createPage("_root_/broken").render(() => {
		throw new Error("render boom")
	})
	const documentRoot = createRootLayout("_root_").render((props) =>
		createComponent(Dynamic, {
			component: "html",
			get children() {
				return createComponent(Dynamic, {
					component: "body",
					get children() {
						return props.children
					},
				})
			},
		}),
	)
	const answer = async (layout: typeof root): Promise<[number, string]> => {
		const routes = createRouter({
			layouts: { _root_: layout },
			routeTree: [{ id: "_root_/broken", path: "/broken", module: broken }],
		})
		const response = await createServer({ router: routes }).fetch(new Request("http://localhost/broken"))
		return [response.status, await response.text()]
	}
	const [status, body] = await answer(documentRoot)
	expect(status).toBe(500)
	expect(body).toMatch(/^<!DOCTYPE html><html lang="en">.*<title>500 Something went wrong<\/title>/)
	expect(body).toMatch(/<code>[\da-f]{12}<\/code>/)
	expect(body).not.toContain("render boom")
	const [bareStatus, bare] = await answer(root)
	expect([bareStatus, bare.includes("<h1>Something went wrong</h1>")]).toEqual([500, true])
})
