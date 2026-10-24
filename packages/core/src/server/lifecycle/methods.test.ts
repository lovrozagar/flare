import { expect, it } from "vitest"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createServerFn } from "../server-fn/dispatch.ts"
import { notFound, redirect } from "../../shared/errors/index.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import { finalize } from "./finalize.ts"
import {
	applyMethod,
	REFUSED,
	refusedChannel,
	checkResponseMethods,
	routeMethod,
	type MethodMatch,
	type RefusedAnswer,
} from "./methods.ts"
import type { RuntimeOptions } from "./options.ts"

const document = () => new Response("hello", { status: 200, headers: { "x-flare": "1" } })

function call(method: string): Promise<Response> {
	return Promise.resolve(applyMethod(new Request("http://localhost/", { method }), document()))
}

it("GET serves", async () => {
	const response = await call("GET")
	expect(response.status).toBe(200)
})

it("HEAD is empty", async () => {
	const get = await call("GET")
	const head = await call("HEAD")
	expect(head.status).toBe(200)
	expect(head.headers.get("x-flare")).toBe(get.headers.get("x-flare"))
	expect((await head.arrayBuffer()).byteLength).toBe(0)
})

// A HEAD's answer is built anew, and the render mode and cache verdict finalize wrote on the document go with it
// (BUGS.md 337).
it("HEAD keeps flare headers", () => {
	const page = finalize({ status: 200, body: "page", render: "isr", cache: "miss" })
	const head = applyMethod(new Request("http://localhost/", { method: "HEAD" }), page)
	expect([head.headers.get("flare-render"), head.headers.get("flare-cache")]).toEqual(["isr", "miss"])
})

it("OPTIONS", async () => {
	const response = await call("OPTIONS")
	expect(response.status).toBe(204)
	expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS")
})

it("POST is 405", async () => {
	const response = await call("POST")
	expect(response.status).toBe(405)
	expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS")
})

it("order", async () => {
	const calls: string[] = []
	const response = await routeMethod(new Request("http://localhost/page", { method: "POST" }), {
		match() {
			calls.push("match")
			return {
				kind: "page",
				render() {
					calls.push("render")
					return new Response("page")
				},
			}
		},
	})
	expect(calls).toEqual(["match"])
	expect(response.status).toBe(405)
	expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS")
	const allowed = await routeMethod(new Request("http://localhost/page", { method: "GET" }), {
		match() {
			calls.push("match")
			return {
				kind: "page",
				render() {
					calls.push("render")
					return new Response("page", { status: 200 })
				},
			}
		},
	})
	expect(calls).toEqual(["match", "match", "render"])
	expect(allowed.status).toBe(200)
	expect(await allowed.text()).toBe("page")
})

// A .response() page answers the methods it declares, GET when it declares none (plan 21 13.5, BUGS.md 208). HEAD runs
// it as GET does and sends no body. OPTIONS is 204 unless the page declares it. Any other method is 405 and never calls
// it. Both carry the request's security set and Allow.
it("response methods", async () => {
	const seen: string[] = []
	const match = (methods?: readonly string[]) => (): MethodMatch => ({
		kind: "response",
		methods,
		handle(request) {
			seen.push(request.method)
			if (request.method === "POST") return request.text().then((text) => new Response(text))
			return new Response("body", { headers: { "x-kept": "1" } })
		},
	})
	const headers = new Headers({ "x-frame-options": "DENY" })
	const call = (method: string, methods?: readonly string[], body?: string): Promise<Response> =>
		routeMethod(new Request("http://localhost/", { method, body }), { match: match(methods), headers })
	expect(await (await call("GET")).text()).toBe("body")
	const head = await call("HEAD")
	expect([head.status, head.headers.get("x-kept"), await head.text()]).toEqual([200, "1", ""])
	const options = await call("OPTIONS")
	expect([options.status, options.headers.get("allow"), options.headers.get("x-frame-options")]).toEqual([
		204,
		"GET, HEAD, OPTIONS",
		"DENY",
	])
	for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
		const refused = await call(method, undefined, method === "DELETE" ? undefined : "x")
		expect([method, refused.status, refused.headers.get("allow")]).toEqual([method, 405, "GET, HEAD, OPTIONS"])
	}
	expect(seen).toEqual(["GET", "HEAD"])
	seen.length = 0
	expect(await (await call("POST", ["POST"], "payload")).text()).toBe("payload")
	const get = await call("GET", ["POST"])
	expect([get.status, get.headers.get("allow")]).toEqual([405, "POST, OPTIONS"])
	expect(await (await call("OPTIONS", ["GET", "OPTIONS"])).text()).toBe("body")
	// A page that declares OPTIONS lists it once; one with no GET answers HEAD 405, as any undeclared method.
	const declared = await call("DELETE", ["GET", "OPTIONS"])
	expect([declared.status, declared.headers.get("allow")]).toEqual([405, "GET, OPTIONS, HEAD"])
	const headless = await call("HEAD", ["POST"])
	expect([headless.status, headless.headers.get("allow")]).toEqual([405, "POST, OPTIONS"])
	expect(seen).toEqual(["POST", "OPTIONS"])
})

it("unmatched post", async () => {
	let assets = 0
	const input = {
		match: (): MethodMatch | undefined => undefined,
		assets: () => {
			assets += 1
			return new Response("asset")
		},
	}
	const post = await routeMethod(new Request("http://localhost/missing", { method: "POST" }), input)
	expect(post.status).toBe(405)
	expect(post.headers.get("allow")).toBe("GET, HEAD, OPTIONS")
	expect(assets).toBe(0)
	const get = await routeMethod(new Request("http://localhost/missing", { method: "GET" }), input)
	expect(get.status).toBe(404)
	const head = await routeMethod(new Request("http://localhost/missing", { method: "HEAD" }), input)
	expect(head.status).toBe(404)
	expect(assets).toBe(0)
})

const check = (routeTree: unknown) => () => checkResponseMethods({ routeTree, layouts: {} } as never)

// A hand-built router's `.response()` methods are checked when the server starts, on the node or on its record
// (plan 21 13.5, BUGS.md 208).
it("check methods", () => {
	const page = createPage("_root_/api").response(() => new Response("api"), { methods: ["POST"] })
	const wrong = createPage("_root_/api").response(() => new Response("api"), { methods: ["post"] as never })
	expect(check([{ id: "_root_/api", path: "/api", module: page }])).not.toThrow()
	expect(check([{ id: "_root_/api", path: "/api", module: wrong }])).toThrow(
		"createServer: _root_/api .response() methods is a non-empty array",
	)
	const lazy = { id: "_root_/api", path: "/api", methods: [], module: async () => ({ route: page }) }
	expect(check([lazy])).toThrow("createServer: _root_/api")
	expect(check([{ id: "_root_/", path: "/", module: async () => ({ route: page }) }])).not.toThrow()
})

const respond = () => new Response("")

const step = (request: { url: string }) => {
	if (request.url.endsWith("/broken")) throw new Error("rewrite broke")
	if (request.url.endsWith("/moved")) redirect({ to: "_root_/page" })
	if (request.url.endsWith("/gone")) notFound()
	if (request.url.endsWith("/unbuilt")) redirect({ to: "_root_/users/[id]" } as never)
	return request.url.endsWith("/old") ? { status: 308, location: "/hook" } : { status: 200 }
}

// A server's refused channel over three routes, a mount, and two server functions, one whose module fails to load,
// and the error lines its sink logs.
function refusedServer(
	security?: RuntimeOptions["security"],
	serverContext?: RuntimeOptions["serverContext"],
): {
	at: (path: string, method?: string) => Promise<RefusedAnswer>
	logged: string[]
} {
	const router = createRouter({
		layouts: { _root_: createRootLayout("_root_").render((props) => props.children) },
		routeTree: [
			{ id: "_root_/hook", path: "/hook", module: createPage("_root_/hook").response(respond, { methods: ["POST"] }) },
			{ id: "_root_/api", path: "/api", module: createPage("_root_/api").response(respond) },
			{ id: "_root_/page", path: "/page", module: createPage("_root_/page").render(() => "page") },
		],
	})
	const logged: string[] = []
	const sink = {
		dev: false,
		log: {
			level: "error" as const,
			error: (...line: unknown[]) => void logged.push(String(line.at(-1))),
			warn: () => undefined,
			log: () => undefined,
		},
	}
	const echo = createServerFn({ method: "post", __id: "echo000000000000", __name: "echo" } as never).handler(() => "x")
	const serving = {
		options: {
			router,
			serverFns: {
				echo000000000000: async () => echo,
				fail000000000000: async () => Promise.reject(new Error("module broke")),
			},
			security,
			serverContext,
		},
		mounts: [{ prefix: "/mounted", fetch: respond }],
		sink,
	}
	const refused = refusedChannel(serving as never, step)[REFUSED]
	const headers = new Headers({ "user-agent": "agent" })
	return {
		at: (path, method = "TRACE") => refused({ method, url: `http://localhost${path}`, headers, env: {} }),
		logged,
	}
}

// What an adapter that cannot make a request of the method gets, in the order Bun's pipeline answers it: an unknown
// internal param's 400, the canonical step's redirect (a step that throws is the projected 500), 501 on a mounted path
// the method cannot reach, a server function's 404 when its id is unknown and else 405 naming its method, and a route's
// 405 with its own Allow. A step that throws a redirect answers it; any other throw, and a server function whose module
// fails to load, is the projected 500, as `failed` answers (BUGS.md 280, 284, 289, 291).
it("refused channel", async () => {
	const { at, logged } = refusedServer()
	const paths = [
		"/page?_flare=bogus",
		"/broken",
		"/moved",
		"/gone",
		"/unbuilt",
		"/old",
		"/mounted/x",
		"/_flare/fn/unknown0000000000",
		"/_flare/fn/echo000000000000",
		"/_flare/fn/fail000000000000",
		"/hook",
		"/api",
		"/page",
		"/elsewhere",
	]
	const answers = await Promise.all(paths.map((path) => at(path)))
	expect(answers.map((answer) => ({ ...answer, headers: undefined }))).toEqual([
		{ status: 400 },
		{ status: 500 },
		{ status: 303, location: "/page" },
		{ status: 500 },
		{ status: 500 },
		{ status: 308, location: "/hook" },
		{ status: 501 },
		{ status: 404 },
		{ status: 405, allow: "POST, OPTIONS" },
		{ status: 500 },
		{ status: 405, allow: "POST, OPTIONS" },
		{ status: 405, allow: "GET, HEAD, OPTIONS" },
		{ status: 405, allow: "GET, HEAD, OPTIONS" },
		{ status: 405, allow: "GET, HEAD, OPTIONS" },
	])
	expect(logged.join(" ")).toContain("rewrite broke")
	expect(logged.join(" ")).toContain("module broke")
	expect(new Set(answers.map((answer) => answer.headers?.get("x-frame-options")))).toEqual(new Set(["DENY"]))
})

// The X-Frame-Options a refused answer carries under the server's security.
async function frame(security: RuntimeOptions["security"]): Promise<string | null | undefined> {
	return (await refusedServer(security).at("/old")).headers?.get("x-frame-options")
}

// A canonical redirect carries the set Bun's pipeline builds before serverContext runs: the server's own as an object,
// the defaults as a callback, which needs the request's context (BUGS.md 491).
it("refused channel security", async () => {
	expect(await frame({ "X-Frame-Options": "SAMEORIGIN" })).toBe("SAMEORIGIN")
	expect(await frame(() => ({ "X-Frame-Options": "SAMEORIGIN" }))).toBe("DENY")
})

// An answer made after serverContext carries a callback's set, as on Bun: the callback gets the request Node cannot
// make as a RefusedMethodRequest, a Request that reads the real method over a GET of the URL and headers. A callback
// that throws is the projected 500 with the defaults, as `failed` answers (BUGS.md 514).
it("refused callback security", async () => {
	const seen: string[] = []
	const security = ({ request }: { request: Request }) => {
		seen.push(`${request.method} ${String(request instanceof Request)} ${request.headers.get("user-agent")}`)
		return { "X-Frame-Options": "SAMEORIGIN" as const }
	}
	const { at } = refusedServer(security)
	const answers = await Promise.all(["TRACE", "CONNECT", "TRACK"].map((method) => at("/page", method)))
	expect(answers.map((answer) => [answer.status, answer.headers?.get("x-frame-options")])).toEqual([
		[405, "SAMEORIGIN"],
		[405, "SAMEORIGIN"],
		[405, "SAMEORIGIN"],
	])
	expect(seen).toEqual(["TRACE true agent", "CONNECT true agent", "TRACK true agent"])
	const broken = refusedServer(() => {
		throw new Error("security broke")
	})
	const failed = await broken.at("/page")
	expect([failed.status, failed.headers?.get("x-frame-options")]).toEqual([500, "DENY"])
	expect(broken.logged.join(" ")).toContain("security broke")
	// serverContext runs first with the same request and the env, and its value reaches the callback; a throw there is
	// the logged 500 with the defaults too.
	const contexts: string[] = []
	const contextual = refusedServer(
		({ serverContext }) => ({ "X-Frame-Options": Reflect.get(Object(serverContext), "frame") }),
		({ request, env }) => {
			contexts.push(`${request.method} ${JSON.stringify(env)}`)
			return { frame: "SAMEORIGIN" } as never
		},
	)
	expect((await contextual.at("/page", "TRACK")).headers?.get("x-frame-options")).toBe("SAMEORIGIN")
	expect(contexts).toEqual(["TRACK {}"])
	const unready = refusedServer({ "X-Frame-Options": "SAMEORIGIN" }, () => {
		throw new Error("context broke")
	})
	const refused = await unready.at("/page")
	expect([refused.status, refused.headers?.get("x-frame-options")]).toEqual([500, "SAMEORIGIN"])
	expect(unready.logged.join(" ")).toContain("context broke")
})
