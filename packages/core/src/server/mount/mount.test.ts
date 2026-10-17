import { expect, it, vi } from "vitest"
import { createServer, serveWith } from "../lifecycle/create.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import { serverCtx } from "../context/ctx.ts"
import type { Logger } from "../lifecycle/logger.ts"
import { activeMount, dispatchMount, mount, mountTable, type Mount, type MountCall } from "./mount.ts"

const router = createRouter({
	layouts: { _root_: createRootLayout("_root_").render((props) => props.children) },
	routeTree: [{ id: "_root_/about", path: "/about", module: createPage("_root_/about").render(() => "about") }],
})

function serve(mounts: readonly Mount[]): ReturnType<typeof createServer> {
	return createServer({ router, mounts })
}

const call: MountCall = { env: { site: "s" }, ctx: { waitUntil: () => undefined } }

function echoing(name: string): Mount["fetch"] {
	return async (request) => new Response(`${name} ${new URL(request.url).pathname}${new URL(request.url).search}`)
}

it("match", async () => {
	const fetch = vi.fn<Mount["fetch"]>(echoing("api"))
	const response = await serve([mount("/api", fetch)]).fetch(new Request("http://localhost/api/x"))
	expect(await response.text()).toBe("api /x")
	expect(fetch).toHaveBeenCalledOnce()
})

it("no match", async () => {
	const fetch = vi.fn<Mount["fetch"]>(echoing("api"))
	const response = await serve([mount("/api", fetch)]).fetch(new Request("http://localhost/about"))
	expect(await response.text()).toContain("about")
	expect(fetch).not.toHaveBeenCalled()
})

it("segment boundary", async () => {
	const fetch = vi.fn<Mount["fetch"]>(echoing("api"))
	const response = await serve([mount("/api", fetch)]).fetch(new Request("http://localhost/apiv2"))
	expect(response.status).toBe(404)
	expect(fetch).not.toHaveBeenCalled()
})

it("root prefix", () => {
	expect(() => mount("/", echoing("root"))).toThrow("mount prefix")
	expect(() => mount("/api/", echoing("api"))).toThrow("mount prefix")
	expect(() => mount("api", echoing("api"))).toThrow("mount prefix")
	// A plain entry is checked at startup too, against the router's own canonical form.
	expect(() => serve([{ prefix: "/", fetch: echoing("root") }])).toThrow("mount prefix")
	expect(() => serve([{ prefix: "/API", fetch: echoing("api") }])).toThrow("mount prefix")
})

const sniffing: Mount["fetch"] = async () =>
	new Response("body", { headers: { "x-content-type-options": "sniff", "x-own": "1" } })

const later: Mount["fetch"] = (_request, _env, ctx) => {
	ctx.waitUntil(Promise.reject(new Error("later")))
	return new Response("ok")
}

const syncThrow: Mount["fetch"] = () => {
	throw new Error("sync broke")
}

const broken: Mount["fetch"] = async () => {
	throw new Error("mount broke")
}

// The mount's answer passes through finalize: the security set is added and the mount cannot drop it.
it("headers", async () => {
	const response = await serve([mount("/api", sniffing)]).fetch(new Request("http://localhost/api/x"))
	expect(response.headers.get("x-content-type-options")).toBe("nosniff")
	expect(response.headers.get("x-own")).toBe("1")
	expect(await response.text()).toBe("body")
	// A mount that throws is the 500 every exit shares, with the same set.
	const thrown = await serve([mount("/api", broken)]).fetch(new Request("http://localhost/api/x"))
	expect(thrown.status).toBe(500)
	expect(thrown.headers.get("x-content-type-options")).toBe("nosniff")
})

it("longer prefix wins", async () => {
	const server = serve([mount("/api", echoing("api")), mount("/api/v2", echoing("v2"))])
	expect(await (await server.fetch(new Request("http://localhost/api/v2/x"))).text()).toBe("v2 /x")
	expect(await (await server.fetch(new Request("http://localhost/api/v1/x"))).text()).toBe("api /v1/x")
})

it("equal prefix", () => {
	expect(() => serve([mount("/api", echoing("a")), mount("/api", echoing("b"))])).toThrow("mount prefix /api")
})

// The fetch sees the canonical path with the prefix removed and the query kept. The prefix alone is `/`.
it("strip", async () => {
	const table = mountTable([mount("/api", echoing("api"))], {})
	expect(await (await dispatchMount(table, new Request("http://localhost/api/x?q=1"), call))?.text()).toBe("api /x?q=1")
	expect(await (await dispatchMount(table, new Request("http://localhost/api"), call))?.text()).toBe("api /")
	expect((await dispatchMount(table, new Request("http://localhost/api//x"), call))?.status).toBe(400)
	// A parsed URL turns `\` into `/` and encodes a control character, so neither survives to the strip.
	expect(await (await dispatchMount(table, new Request("http://localhost/api/\\x"), call))?.status).toBe(400)
	expect(await (await dispatchMount(table, new Request("http://localhost/api/a\u0001b"), call))?.text()).toBe(
		"api /a%01b",
	)
	expect(await dispatchMount(table, new Request("http://localhost/other"), call)).toBeUndefined()
	// The prefix is the active mount while its fetch runs, and only then.
	const seen: Array<string | undefined> = []
	const watch = mountTable([mount("/api", async () => new Response(String(seen.push(activeMount()))))], {})
	await dispatchMount(watch, new Request("http://localhost/api/x"), call)
	expect(seen).toEqual(["/api"])
	expect(activeMount()).toBeUndefined()
})

// A fetch app may answer synchronously, as Hono's `app.fetch` does, and a sync throw is the projected 500.
it("sync handler", async () => {
	const server = serve([mount("/api", () => new Response("sync")), mount("/boom", syncThrow)])
	expect(await (await server.fetch(new Request("http://localhost/api/x"))).text()).toBe("sync")
	expect((await server.fetch(new Request("http://localhost/boom/x"))).status).toBe(500)
})

// The handler gets createServer's env and the adapter's context, so `mount(prefix, app.fetch)` works unchanged.
it("env", async () => {
	const seen: unknown[] = []
	const waitUntil = vi.fn<(promise: Promise<unknown>) => void>()
	const fetch: Mount["fetch"] = (_request, env, ctx) => {
		seen.push(env)
		ctx.waitUntil(Promise.resolve())
		return new Response("ok")
	}
	await serve([mount("/api", fetch)]).fetch(new Request("http://localhost/api/x"), { site: "s" }, { waitUntil })
	expect(seen).toEqual([{ site: "s" }])
	expect(waitUntil).toHaveBeenCalledOnce()
	// Without an adapter context, the work still runs, and a rejection is projected like any bug.
	await serve([mount("/api", fetch)]).fetch(new Request("http://localhost/api/x"))
	expect(seen).toHaveLength(2)
	const error = vi.fn<Logger["error"]>()
	const log: Logger = { level: "error", error, warn: () => undefined, log: () => undefined }
	await serveWith({ router, mounts: [mount("/api", later)] }, { dev: true, log }).fetch(
		new Request("http://localhost/api/x"),
	)
	await vi.waitFor(() => expect(error).toHaveBeenCalledWith("render", "later", expect.any(String)))
})

// serverContext runs once, before the mount, and serverCtx() reads it inside the mount.
it("server context", async () => {
	const make = vi.fn<() => { tenant: string }>(() => ({ tenant: "t" }))
	const seen: unknown[] = []
	const read: Mount["fetch"] = () => {
		seen.push(serverCtx())
		return new Response("ok")
	}
	const server = createServer({ router, mounts: [mount("/api", read)], serverContext: make })
	await server.fetch(new Request("http://localhost/api/x"))
	expect(make).toHaveBeenCalledOnce()
	expect(seen).toEqual([{ tenant: "t" }])
})

// A mount's fetch answers with a Response; anything else is the app's bug, named by the prefix (plan 21 9.1).
it("answer type", async () => {
	for (const [answer, named] of [
		[null, "null"],
		[undefined, "undefined"],
		["text", "string"],
	] as const) {
		const table = mountTable([mount("/m", () => answer as never)], {})
		await expect(dispatchMount(table, new Request("http://localhost/m/x"), call)).rejects.toThrow(
			`mount /m answered ${named}, not a Response`,
		)
	}
})
