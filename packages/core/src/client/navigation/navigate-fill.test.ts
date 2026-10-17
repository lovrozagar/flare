import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { encodeFrame, type Frame } from "../../shared/protocol/index.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import { mountNavigator, unmountAll, type Fetch } from "./navigate.fixture.ts"

// A stored page's `"stream"` holes are filled by one `_flare=fill` revalidation of the same URL (dx/defer.md).

const root = createRootLayout("_root_").render((props) => ["root[", props.children, "]"])
const home = createPage("_root_/").render((props) => [() => `home:${String(props.loaderData)}`])
const about = createPage("_root_/about").render((props) => `about:${String(props.loaderData)}`)
const router = createRouter({
	layouts: { _root_: root },
	routeTree: [
		{ id: "_root_/", path: "/", module: home },
		{ id: "_root_/about", path: "/about", module: about },
	],
})

beforeEach(() => {
	history.replaceState(null, "", "/")
	sessionStorage.clear()
})

afterEach(unmountAll)

function ndjson(frames: readonly Frame[]): Response {
	return new Response(frames.map(encodeFrame).join(""), { headers: { "content-type": "application/x-ndjson" } })
}

function setup(fetch: Fetch) {
	return mountNavigator(router, fetch, { extra: {} })
}

function deferred(key: string) {
	return { __deferred: true, key }
}

// A stored data response can end with a placeholder no frame settled: a `"stream"` hole. The navigator then asks for
// the values with one `_flare=fill` revalidation of the same URL, which writes no history (dx/defer.md).
it("fill on hole landing", async () => {
	const holed: Frame[] = [
		{ t: "l", m: "_root_", d: null },
		{ t: "l", m: "_root_/about", d: { __deferred: true, key: "d0" } },
		{ t: "r" },
		{ t: "d" },
	]
	const filled: Frame[] = [...holed.slice(0, 3), { t: "c", m: "_root_/about", k: "d0", d: "late" }, { t: "d" }]
	const responses = [ndjson(holed), ndjson(filled)]
	const app = await setup(async () => responses.shift() ?? ndjson(filled))
	const length = history.length
	await app.navigator.navigate({ to: "_root_/about" })
	await vi.waitFor(() => expect(app.deps.fetch).toHaveBeenLastCalledWith("/about?_flare=fill", expect.anything()))
	expect(app.deps.fetch).toHaveBeenCalledTimes(2)
	expect(history.length).toBe(length + 1)
	expect(location.pathname).toBe("/about")
})

// A hole heard after the user has left the page asks for nothing: the fill only revalidates the page on screen.
it("no fill after leaving", async () => {
	const later: { close: () => void } = { close: () => undefined }
	const open = new ReadableStream<Uint8Array>({
		start(controller) {
			const encoder = new TextEncoder()
			for (const frame of [
				{ t: "l", m: "_root_", d: null },
				{ t: "l", m: "_root_/about", d: { __deferred: true, key: "d0" } },
				{ t: "r" },
			] as const)
				controller.enqueue(encoder.encode(encodeFrame(frame)))
			later.close = () => {
				controller.enqueue(encoder.encode(encodeFrame({ t: "d" })))
				controller.close()
			}
		},
	})
	const home: Frame[] = [{ t: "l", m: "_root_", d: null }, { t: "l", m: "_root_/", d: "back" }, { t: "r" }, { t: "d" }]
	const responses = [new Response(open), ndjson(home)]
	const app = await setup(async () => responses.shift() ?? ndjson(home))
	await app.navigator.navigate({ to: "_root_/about" })
	await app.navigator.navigate({ to: "_root_/" })
	later.close()
	await new Promise((resolve) => setTimeout(resolve, 20))
	expect(app.deps.fetch).toHaveBeenCalledTimes(2)
	expect(location.pathname).toBe("/")
})

// The fill commits once its response has ended, when every value it carries is in: a commit while one was pending would
// be held for it, silently, with any other write behind it (BUGS.md 89).
it("fill commits at its end", async () => {
	const later: { close: () => void } = { close: () => undefined }
	const open = new ReadableStream<Uint8Array>({
		start(controller) {
			const encoder = new TextEncoder()
			for (const frame of [
				{ t: "l", m: "_root_", d: "fresh" },
				{ t: "l", m: "_root_/about", d: { stats: deferred("stats") } },
				{ t: "r" },
			] as const)
				controller.enqueue(encoder.encode(encodeFrame(frame)))
			later.close = () => {
				controller.enqueue(encoder.encode(encodeFrame({ t: "c", m: "_root_/about", k: "stats", d: 37 })))
				controller.enqueue(encoder.encode(encodeFrame({ t: "d" })))
				controller.close()
			}
		},
	})
	const holed: Frame[] = [
		{ t: "l", m: "_root_", d: "stored" },
		{ t: "l", m: "_root_/about", d: { stats: deferred("stats") } },
		{ t: "r" },
		{ t: "d" },
	]
	const responses = [ndjson(holed), new Response(open)]
	const app = await setup(async () => responses.shift() ?? ndjson(holed))
	await app.navigator.navigate({ to: "_root_/about" })
	await vi.waitFor(() => expect(responses).toEqual([]))
	await new Promise((resolve) => setTimeout(resolve, 20))
	expect(app.store.snapshot().matches[0]?.data).toBe("stored")
	later.close()
	await vi.waitFor(() => expect(app.store.snapshot().matches[0]?.data).toBe("fresh"))
})

// The about page's frames up to `r`, with this data.
function aboutFrames(d: unknown): Frame[] {
	return [{ t: "l", m: "_root_", d: null }, { t: "l", m: "_root_/about", d }, { t: "r" }]
}

// A stored page's resolve value lands inline and its hole asks for the fill. The fill sends the inline value as
// `kept`, so the page keeps the one promise it showed, and fills the hole beside it. A landing with only inline values
// asks for no fill (BUGS.md 94).
it("fill keeps inline values", async () => {
	const stored = aboutFrames({ latest: { __deferred: true, key: "latest", value: "1.0.0" }, stats: deferred("stats") })
	const fill = aboutFrames({ latest: { __deferred: true, key: "latest", kept: true }, stats: deferred("stats") })
	const responses = [
		ndjson([...stored, { t: "d" }]),
		ndjson([...fill, { t: "c", m: "_root_/about", k: "stats", d: 37 }, { t: "d" }]),
	]
	const app = await setup(async () => responses.shift() ?? ndjson([...fill, { t: "d" }]))
	const read = () =>
		app.store.snapshot().matches.find((match) => match.id === "_root_/about")?.data as {
			latest: { promise: Promise<unknown> }
			stats: { promise: Promise<unknown> }
		}
	await app.navigator.navigate({ to: "_root_/about" })
	const shown = read().latest.promise
	await expect(shown).resolves.toBe("1.0.0")
	await vi.waitFor(() => expect(app.deps.fetch).toHaveBeenLastCalledWith("/about?_flare=fill", expect.anything()))
	await vi.waitFor(() => expect(read()).not.toBe(undefined))
	await expect(read().stats.promise).resolves.toBe(37)
	expect(read().latest.promise).toBe(shown)
	expect(app.deps.fetch).toHaveBeenCalledTimes(2)
	const plain = await setup(async () =>
		ndjson([...aboutFrames({ latest: { __deferred: true, key: "latest", value: "1.0.0" } }), { t: "d" }]),
	)
	await plain.navigator.navigate({ to: "_root_/about" })
	await new Promise((resolve) => setTimeout(resolve, 20))
	expect(plain.deps.fetch).toHaveBeenCalledOnce()
})

// A shallow or hash move made while a fill is in flight wins: the fill commits its values onto the page as it is then,
// so the URL, the store's location, and the page's search stay the later move's (plan 21 3.11).
it("later move wins", async () => {
	const later: { close: () => void } = { close: () => undefined }
	const open = new ReadableStream<Uint8Array>({
		start(controller) {
			const encoder = new TextEncoder()
			for (const frame of aboutFrames({ stats: deferred("stats") }))
				controller.enqueue(encoder.encode(encodeFrame(frame)))
			later.close = () => {
				controller.enqueue(encoder.encode(encodeFrame({ t: "c", m: "_root_/about", k: "stats", d: 37 })))
				controller.enqueue(encoder.encode(encodeFrame({ t: "d" })))
				controller.close()
			}
		},
	})
	const responses = [ndjson([...aboutFrames({ stats: deferred("stats") }), { t: "d" }]), new Response(open)]
	const app = await setup(async () => responses.shift() ?? ndjson([...aboutFrames(null), { t: "d" }]))
	await app.navigator.navigate({ to: "_root_/about" })
	await vi.waitFor(() => expect(responses).toEqual([]))
	await app.navigator.navigate({ to: "_root_/about", search: { tab: "x" }, shallow: true })
	await app.navigator.navigate({ to: "_root_/about", search: { tab: "x" }, hash: "h" })
	const before = app.store.snapshot()
	later.close()
	const about = () => app.store.snapshot().matches.find((match) => match.id === "_root_/about")
	// The fill committed: a new snapshot holds its values.
	await vi.waitFor(() => expect(app.store.snapshot()).not.toBe(before))
	expect([location.search, location.hash]).toEqual(["?tab=x", "#h"])
	expect(app.store.snapshot().location).toEqual({ pathname: "/about", search: "?tab=x", hash: "#h" })
	expect(about()?.search).toEqual({ tab: "x" })
})

// A navigation that commits nothing, here an input failure (400), leaves the page on screen, and that page's deferred
// values keep streaming: its request is aborted only when another page commits (plan 21 13.11, BUGS.md 213).
it("uncommitted keeps stream", async () => {
	const encoder = new TextEncoder()
	const later: { send: () => void } = { send: () => undefined }
	const fetch = vi.fn<Fetch>(async (url, init) => {
		if (!url.startsWith("/about")) return new Response(null, { status: 400 })
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				for (const frame of [
					{ t: "l", m: "_root_", d: null },
					{ t: "l", m: "_root_/about", d: { late: deferred("d0") } },
					{ t: "r" },
				] as const)
					controller.enqueue(encoder.encode(encodeFrame(frame)))
				let aborted = false
				init.signal?.addEventListener("abort", () => {
					aborted = true
					controller.error(new DOMException("aborted", "AbortError"))
				})
				later.send = () => {
					if (aborted) return
					controller.enqueue(encoder.encode(encodeFrame({ t: "c", m: "_root_/about", k: "d0", d: "late" })))
					controller.enqueue(encoder.encode(encodeFrame({ t: "d" })))
					controller.close()
				}
			},
		})
		return new Response(body)
	})
	const app = await setup(fetch)
	await app.navigator.navigate({ to: "_root_/about" })
	const late: unknown = Reflect.get(Object(app.store.snapshot().matches[1]?.data), "late")
	const value: unknown = Reflect.get(Object(late), "promise")
	await app.navigator.navigate({ to: "_root_/" })
	expect(location.pathname).toBe("/about")
	later.send()
	await expect(
		Promise.race([value, new Promise((resolve) => setTimeout(() => resolve("pending"), 200))]),
	).resolves.toBe("late")
})
