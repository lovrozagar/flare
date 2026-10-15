import { expect, it } from "vitest"
import { decide, type DecideInput } from "../cacheability/decide.ts"
import { createServer } from "./create.ts"
import { exitHeaders, NO_STORE, policyHeaders, recordCookies } from "./policies.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter, type RouteModule } from "../../shared/router/create-router.ts"
import type { CacheConfig } from "../../shared/route-builder/chain.ts"

const open = { requires: false, reads: false }
const ok = { status: 200, params: { id: "7" } }

function decided(page: CacheConfig | undefined, extra: Partial<DecideInput> = {}): ReturnType<typeof decide> {
	return decide({ chain: [undefined, page], auth: open, session: false, ...extra })
}

const shared = decided({ isr: true, cdn: { maxAge: "60s", swr: "30s", tags: ["a", "b"] } })

it("header", () => {
	expect(policyHeaders(shared, ok).get("cache-control")).toBe(
		"public, max-age=0, s-maxage=60, stale-while-revalidate=30",
	)
	// swr defaults to 0, and a shared answer with no maxAge is not public.
	expect(policyHeaders(decided({ isr: true, cdn: { maxAge: "2m" } }), ok).get("cache-control")).toBe(
		"public, max-age=0, s-maxage=120, stale-while-revalidate=0",
	)
	expect(policyHeaders(decided({ isr: true }), ok).get("cache-control")).toBe(NO_STORE)
})

it("private header", () => {
	const headers = policyHeaders(decided({ isr: true, cdn: { maxAge: "60s", private: true, tags: ["a"] } }), ok)
	expect(headers.get("cache-control")).toBe("private, no-store")
	expect(headers.has("cache-tag")).toBe(false)
})

it("no-store header", () => {
	expect(policyHeaders(decided(undefined), ok).get("cache-control")).toBe("private, no-store")
})

it("cache tag", () => {
	expect(policyHeaders(shared, ok).get("cache-tag")).toBe("a, b")
	// A tags function gets the raw params, the values the store key uses (B32).
	const byParams = decided({
		isr: true,
		cdn: { maxAge: "60s", tags: ({ params }) => [`user:${String(params["id"])}`] },
	})
	expect(policyHeaders(byParams, ok).get("cache-tag")).toBe("user:7")
	expect(policyHeaders(decided({ isr: true, cdn: { maxAge: "60s", tags: [] } }), ok).has("cache-tag")).toBe(false)
})

// Flare sends no Vary, so a CDN cannot tell a session from none: the anonymous answer stays private at the edge.
it("anonymous header", () => {
	const anonymous = decided(
		{ isr: true, cdn: { maxAge: "60s", tags: ["a"] } },
		{ auth: { requires: false, reads: true } },
	)
	expect(anonymous).toMatchObject({ policy: "shared", class: "anonymous" })
	const headers = policyHeaders(anonymous, ok)
	expect(headers.get("cache-control")).toBe("private, no-store")
	expect(headers.has("cache-tag")).toBe(false)
})

it("error status", () => {
	for (const status of [302, 401, 403, 404, 500]) {
		const headers = policyHeaders(shared, { ...ok, status })
		expect(headers.get("cache-control")).toBe("private, no-store")
		expect(headers.has("cache-tag")).toBe(false)
	}
})

// A data or prefetch answer with an `e` frame or a redirect stays HTTP 200 (B73), so the frames say it.
it("data error frame", () => {
	expect(policyHeaders(shared, { ...ok, errored: true }).get("cache-control")).toBe("private, no-store")
})

const request = (): Request => new Request("http://localhost/r")

const answer = (): Response => new Response("r", { headers: { "cache-control": "public, max-age=60" } })

function routerFor(page: RouteModule): ReturnType<typeof createRouter> {
	return createRouter({
		layouts: { _root_: createRootLayout("_root_").render((props) => props.children) },
		routeTree: [{ id: "_root_/r", path: "/r", module: page, response: true }],
	})
}

const cachingHeaders = (): Record<string, string> => ({ "Cache-Control": "public, max-age=60", "Cache-Tag": "x" })

// The decision owns Cache-Control and Cache-Tag on a rendered page: `.headers()` cannot set them.
it("headers cannot", async () => {
	const page = createPage("_root_/r")
		.headers(cachingHeaders)
		.render(() => "r")
	const server = createServer({
		router: createRouter({
			layouts: { _root_: createRootLayout("_root_").render((props) => props.children) },
			routeTree: [{ id: "_root_/r", path: "/r", module: page }],
		}),
	})
	for (const path of ["/r", "/r?_flare=data"]) {
		const response = await server.fetch(new Request(`http://localhost${path}`))
		expect(response.headers.get("cache-control")).toBe("private, no-store")
		expect(response.headers.has("cache-tag")).toBe(false)
	}
})

// A .response() page keeps its own Cache-Control unless the chain requires or reads auth, as a server fn (B43).
it("response auth", async () => {
	const guarded = routerFor(createPage("_root_/r").authenticateOptional().response(answer))
	const plain = routerFor(createPage("_root_/r").response(answer))
	const withAuth = await createServer({ router: guarded, authenticate: () => null }).fetch(request())
	expect(withAuth.headers.get("cache-control")).toBe("private, no-store")
	const without = await createServer({ router: plain }).fetch(request())
	expect(without.headers.get("cache-control")).toBe("public, max-age=60")
})

// The exit compares an answer's cookies with the ones it left its stage with. A rebuilt Response has no record.
it("exit headers", () => {
	const PUBLIC = "public, max-age=0, s-maxage=60, stale-while-revalidate=0"
	const staged = (): Response =>
		recordCookies(new Response(null, { headers: { "cache-control": PUBLIC, "cache-tag": "t", "set-cookie": "r=1" } }))
	expect(exitHeaders(staged()).get("cache-control")).toBe(PUBLIC)
	const late = staged()
	late.headers.append("set-cookie", "m=1")
	expect(exitHeaders(late).get("cache-control")).toBe(NO_STORE)
	expect(exitHeaders(late).has("cache-tag")).toBe(false)
	expect(exitHeaders(new Response(null, staged())).get("cache-control")).toBe(NO_STORE)
	expect(exitHeaders(new Response(null, { headers: { "cache-control": PUBLIC } })).get("cache-control")).toBe(PUBLIC)
	const kept = new Response(null, { headers: { "cache-control": "private, max-age=60", "set-cookie": "r=1" } })
	expect(exitHeaders(kept).get("cache-control")).toBe("private, max-age=60")
})
