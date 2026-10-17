import { expect, it } from "vitest"
import { serverCtx } from "../../src/server/context/ctx.ts"
import { withFetchDedupe } from "../../src/server/context/fetch-dedupe.ts"
import { createServer } from "../../src/server/lifecycle/create.ts"
import { createLayout } from "../../src/shared/route-builder/layout.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"
import { createRouter } from "../../src/shared/router/create-router.ts"

// dx/server.md's serverCtx and withFetchDedupe through the real `createServer(...).fetch` (B96): one request's
// layout loader, preloader, and page loader share one dedupe store, and each reads its own body.

const root = createRootLayout("_root_").render((props) => props.children)

// A target that counts its calls by method and URL, and answers each with a fresh body.
function counting(answer: (url: string) => Response = (url) => new Response(`body ${url}`)) {
	const calls: string[] = []
	const target = async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input instanceof Request ? input.url : input)
		calls.push(`${init?.method ?? "GET"} ${url}`)
		return answer(url)
	}
	return { calls, target }
}

// A group layout and its page each read through `read`, the page in its preloader and its loader too.
function serve(read: (step: string) => Promise<string>) {
	const group = createLayout("_root_/(g)")
		.loader(async () => ({ layout: await read("layout") }))
		.render((props) => props.children)
	const page = createPage("_root_/(g)/p")
		.preloader(async () => ({ pre: await read("preloader") }))
		.loader(async () => ({ page: await read("page"), ctx: serverCtx() }))
		.render((props) => JSON.stringify(props.loaderData))
	const router = createRouter({
		layouts: { _root_: root, "_root_/(g)": group },
		routeTree: [{ id: "_root_/(g)/p", path: "/p", module: page }],
	})
	return createServer({ router, serverContext: () => ({ tenant: "acme" }) })
}

// serverCtx() is the value serverContext returned, outside a request it throws, and it is not the request event.
it("server ctx", async () => {
	expect(() => serverCtx()).toThrow("serverCtx: called outside a request")
	const body = await (await serve(async () => "x").fetch(new Request("http://localhost/p"))).text()
	expect(body).toContain('"ctx":{"tenant":"acme"}')
})

// One request's loaders, preloader included, share one entry per key, and each reads its own body; another request,
// another header, HEAD, or a new arrow target is its own entry; a non-GET clears the map; a rejection is not reused
// (dx/server.md withFetchDedupe).
it("fetch dedupe", async () => {
	const shared = counting()
	const dedupe = withFetchDedupe(shared.target)
	const server = serve(async (step) => (await dedupe("https://api.test/a")).text().then((text) => `${step}:${text}`))
	const body = await (await server.fetch(new Request("http://localhost/p"))).text()
	expect(body).toContain('"page":"page:body https://api.test/a"')
	// The layout, the preloader, and the page each read a body of their own from the one call: a shared body would
	// throw on its second read.
	expect(shared.calls).toEqual(["GET https://api.test/a"])
	await server.fetch(new Request("http://localhost/p"))
	expect(shared.calls).toHaveLength(2)
	const varied = counting()
	const variedDedupe = withFetchDedupe(varied.target)
	await serve(async (step) => {
		if (step === "layout") await variedDedupe("https://api.test/a", { headers: { "x-v": "1" } })
		if (step === "preloader") await variedDedupe("https://api.test/a", { method: "HEAD" })
		if (step === "page") await withFetchDedupe(async (input, init) => varied.target(input, init))("https://api.test/a")
		return (await variedDedupe("https://api.test/a")).text()
	}).fetch(new Request("http://localhost/p"))
	expect(varied.calls.sort()).toEqual([
		"GET https://api.test/a",
		"GET https://api.test/a",
		"GET https://api.test/a",
		"HEAD https://api.test/a",
	])
	const cleared = counting()
	const clearedDedupe = withFetchDedupe(cleared.target)
	await serve(async (step) => {
		// Preloaders run first: the page loader's POST lands between its own GET and the preloader's.
		if (step === "page") await clearedDedupe("https://api.test/w", { method: "POST" })
		return (await clearedDedupe("https://api.test/a")).text()
	}).fetch(new Request("http://localhost/p"))
	expect(cleared.calls.filter((call) => call === "GET https://api.test/a")).toHaveLength(2)
	let fail = true
	const flaky = counting((url) => {
		if (fail) {
			fail = false
			throw new Error("flaky")
		}
		return new Response(url)
	})
	const flakyDedupe = withFetchDedupe(flaky.target)
	await serve(async () => (await flakyDedupe("https://api.test/a").catch(() => new Response("failed"))).text()).fetch(
		new Request("http://localhost/p"),
	)
	expect(flaky.calls).toHaveLength(2)
})

// A body over `maxBytes`, or an event stream, is not memoized: every caller fetches on its own. Outside a request a
// call passes through, and `globalThis.fetch` is not patched (dx/server.md withFetchDedupe).
it("fetch dedupe limits", async () => {
	const big = counting(
		(url) =>
			new Response("x".repeat(64), url.endsWith("sse") ? { headers: { "content-type": "text/event-stream" } } : {}),
	)
	const capped = withFetchDedupe(big.target, { maxBytes: 16 })
	const loose = withFetchDedupe(big.target)
	await serve(async () => (await capped("https://api.test/big")).text()).fetch(new Request("http://localhost/p"))
	await serve(async () => (await loose("https://api.test/sse")).text()).fetch(new Request("http://localhost/p"))
	expect(big.calls.filter((call) => call.endsWith("/big"))).toHaveLength(3)
	expect(big.calls.filter((call) => call.endsWith("/sse"))).toHaveLength(3)
	const outside = counting()
	const passing = withFetchDedupe(outside.target)
	await passing("https://api.test/a")
	await passing("https://api.test/a")
	expect(outside.calls).toHaveLength(2)
	expect(globalThis.fetch).not.toBe(passing)
})
