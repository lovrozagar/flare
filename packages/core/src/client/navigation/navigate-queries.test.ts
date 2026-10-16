import { flush } from "solid-js"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { encodeFrame, QUERY_GETTER, registerQuery, type Frame } from "../../shared/protocol/index.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import { mountNavigator, unmountAll, type Fetch } from "./navigate.fixture.ts"
import type { Landing, NavigatorDeps } from "./navigate.ts"

// A data answer's `q` frame is the request's query cache. The navigation hydrates it into the document's client when
// it commits, never on arrival: a superseded navigation and a prefetch nobody takes leave the cache alone (B134).

const root = createRootLayout("_root_").render((props) => ["root[", props.children, "]"])
const page = (id: string) => createPage(id).render((props) => `${id.slice(7)}:${String(props.loaderData)}`)
const routeTree = ["_root_/", "_root_/a", "_root_/b"].map((id) => ({ id, path: `/${id.slice(7)}`, module: page(id) }))
const router = createRouter({ layouts: { _root_: root }, routeTree })

function ndjson(frames: readonly Frame[]): Response {
	return new Response(frames.map(encodeFrame).join(""), { headers: { "content-type": "application/x-ndjson" } })
}

const frames = (id: string, queries?: unknown): Frame[] => [
	{ t: "l", m: "_root_", d: null },
	{ t: "l", m: id, d: id.slice(7) },
	...(queries === undefined ? [] : [{ t: "q" as const, d: queries }]),
	{ t: "r" },
	{ t: "d" },
]

// The registered getter's `hydrate`, recording each state with the URL on screen when it ran.
function getter() {
	const seen: Array<{ state: unknown; at: string }> = []
	const hydrate = vi.fn<(state: unknown) => void>((state) => void seen.push({ state, at: location.pathname }))
	registerQuery(Object.assign(() => undefined, { dehydrate: () => undefined, hydrate }))
	return { seen, hydrate }
}

beforeEach(() => {
	history.replaceState(null, "", "/")
	sessionStorage.clear()
})

afterEach(() => {
	unmountAll()
	Reflect.deleteProperty(globalThis, QUERY_GETTER)
})

it("commit hydrates", async () => {
	const { seen } = getter()
	const app = await mountNavigator(
		router,
		vi.fn<Fetch>(async () => ndjson(frames("_root_/a", { queries: ["a"] }))),
	)
	await app.navigator.navigate({ to: "_root_/a" })
	flush()
	expect(seen).toEqual([{ state: { queries: ["a"] }, at: "/" }])
	expect(app.text()).toBe("root[a:a]")
	// An answer with no `q` frame, a request that made no client, hydrates nothing.
	const plain = await mountNavigator(
		router,
		vi.fn<Fetch>(async () => ndjson(frames("_root_/b"))),
	)
	await plain.navigator.navigate({ to: "_root_/b" })
	expect(seen).toHaveLength(1)
})

it("superseded leaves the cache", async () => {
	const { hydrate } = getter()
	const slow = Promise.withResolvers<Response>()
	const answers = [() => slow.promise, async () => ndjson(frames("_root_/b"))]
	const app = await mountNavigator(
		router,
		vi.fn<Fetch>(() => (answers.shift() ?? answers[0])()),
	)
	const first = app.navigator.navigate({ to: "_root_/a" })
	await app.navigator.navigate({ to: "_root_/b" })
	slow.resolve(ndjson(frames("_root_/a", { queries: ["stale"] })))
	await first
	flush()
	expect([app.text(), hydrate.mock.calls]).toEqual(["root[b:b]", []])
})

// A prefetched landing's queries are hydrated only when a navigation takes it; until then the cache is untouched.
it("prefetched at commit", async () => {
	const { seen } = getter()
	const landing: Landing = { data: { _root_: null, "_root_/a": "prefetched" }, heads: {}, queries: { queries: ["p"] } }
	const prefetched = vi.fn<NonNullable<NavigatorDeps["prefetched"]>>(() => Promise.resolve(landing))
	const app = await mountNavigator(router, vi.fn<Fetch>(), { extra: { prefetched } })
	expect(seen).toEqual([])
	await app.navigator.navigate({ to: "_root_/a" })
	flush()
	expect([app.deps.fetch, seen]).toEqual([app.deps.fetch, [{ state: { queries: ["p"] }, at: "/" }]])
	expect(app.deps.fetch).not.toHaveBeenCalled()
})
