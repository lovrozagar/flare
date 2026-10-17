import { createComponent, flush } from "solid-js"
import { Dynamic } from "@solidjs/web"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { ViewTransitionBoundary } from "../../shared/components/index.ts"
import { encodeFrame, type Frame } from "../../shared/protocol/index.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import { mountNavigator, unmountAll } from "./navigate.fixture.ts"

// The commit runs inside a view transition, and history is written after it (dx/navigate.md).

const root = createRootLayout("_root_").render((props) => [
	"root[",
	createComponent(ViewTransitionBoundary, {
		get children() {
			return createComponent(Dynamic, {
				component: "main",
				get children() {
					return props.children
				},
			})
		},
	}),
	"]",
])
const router = createRouter({
	layouts: { _root_: root },
	viewTransitions: true,
	routeTree: [
		{ id: "_root_/", path: "/", module: createPage("_root_/").render(() => "home") },
		{ id: "_root_/about", path: "/about", module: createPage("_root_/about").render(() => "about") },
	],
})

const aboutFrames: Frame[] = [{ t: "l", m: "_root_", d: null }, { t: "l", m: "_root_/about", d: "x" }, { t: "r" }]

// `types` is set only when the start got the object form: the plain callback is the default (B119).
type Started = { scope: string; types: string[] | undefined; pushedBeforeUpdate: boolean }

function stubStart(target: Element | Document, started: Started[], name: string): void {
	Object.defineProperty(target, "startViewTransition", {
		configurable: true,
		value: (arg: (() => void) | { update: () => void; types: string[] }) => {
			const length = history.length
			if (typeof arg === "function") arg()
			else arg.update()
			const types = typeof arg === "function" ? undefined : arg.types
			started.push({ scope: name, types, pushedBeforeUpdate: history.length !== length })
			const done = Promise.resolve()
			return { updateCallbackDone: done, ready: done, finished: done, skipTransition: () => undefined }
		},
	})
}

beforeEach(() => {
	history.replaceState(null, "", "/")
})

afterEach(() => {
	Reflect.deleteProperty(document, "startViewTransition")
	unmountAll()
})

it("view transition", async () => {
	const app = await mountNavigator(router, async () => new Response(aboutFrames.map(encodeFrame).join("")))
	const started: Started[] = []
	stubStart(document, started, "document")
	const main = app.host.querySelector("main")
	if (main === null) throw new Error("no main")
	stubStart(main, started, "main")
	const push = vi.spyOn(history, "pushState")
	await app.navigator.navigate({ to: "_root_/about" })
	flush()
	expect(app.text()).toBe("root[about]")
	// The default scope is the document, though a boundary is there (B119 (5)).
	expect(started).toEqual([{ scope: "document", types: undefined, pushedBeforeUpdate: false }])
	expect(push).toHaveBeenCalledOnce()
	await app.navigator.navigate({
		to: "_root_/about",
		replace: true,
		search: { q: "1" },
		viewTransition: { scope: "auto" },
	})
	expect(started[1]).toEqual({ scope: "main", types: undefined, pushedBeforeUpdate: false })
	await app.navigator.restore("/", 0)
	expect(started[2]).toMatchObject({ types: undefined })
	await app.navigator.navigate({ to: "_root_/about", viewTransition: false })
	expect(started).toHaveLength(3)
	expect(app.text()).toBe("root[about]")
	push.mockRestore()
})

// Back to a page the client cache holds paints it inside the step's transition; the revalidation of a stale one that
// follows refreshes it in place with no transition of its own (B137, plan 21 16.9).
it("held back once", async () => {
	const fetch = vi.fn<(url: string) => Promise<Response>>(
		async (url: string) =>
			new Response(
				(url.startsWith("/about")
					? aboutFrames
					: [{ t: "l", m: "_root_", d: null }, { t: "l", m: "_root_/", d: "h" }, { t: "r" }]
				)
					.map((frame) => encodeFrame(frame as Frame))
					.join(""),
			),
	)
	const app = await mountNavigator(router, fetch)
	const started: Started[] = []
	stubStart(document, started, "document")
	await app.navigator.navigate({ to: "_root_/about" })
	await app.navigator.navigate({ to: "_root_/" })
	const popped = new Promise((resolve) => addEventListener("popstate", resolve, { once: true }))
	history.back()
	await popped
	await app.navigator.restore("/about", app.deps.history.index())
	await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
	await new Promise((resolve) => setTimeout(resolve, 20))
	flush()
	expect(app.text()).toBe("root[about]")
	expect(started).toHaveLength(3)
})

const frames = (id: string): Frame[] => [{ t: "l", m: "_root_", d: null }, { t: "l", m: id, d: "x" }, { t: "r" }]

// A view transition runs its update a frame or more after it starts. A navigation that starts in that window skips the
// older transition, which runs the older update first, as the spec orders it (B17). Only the navigation the user started
// last commits and writes history: the superseded update commits nothing, so history gets no entry for it (BUGS.md 98).
it("superseded update", async () => {
	const pages = createRouter({
		layouts: { _root_: root },
		viewTransitions: true,
		routeTree: [
			{ id: "_root_/", path: "/", module: createPage("_root_/").render(() => "home") },
			{ id: "_root_/a", path: "/a", module: createPage("_root_/a").render(() => "a") },
			{ id: "_root_/b", path: "/b", module: createPage("_root_/b").render(() => "b") },
		],
	})
	const app = await mountNavigator(
		pages,
		async (url) =>
			new Response(
				frames(String(url).includes("/a?") ? "_root_/a" : "_root_/b")
					.map(encodeFrame)
					.join(""),
			),
	)
	let pending: (() => void) | undefined
	let started = 0
	Object.defineProperty(document, "startViewTransition", {
		configurable: true,
		value: (update: () => void) => {
			started += 1
			pending?.()
			const { promise, resolve } = Promise.withResolvers<void>()
			pending = () => {
				pending = undefined
				update()
				resolve()
			}
			// Skipping a transition whose update has not run still runs it first, as the spec orders.
			return { updateCallbackDone: promise, ready: promise, finished: promise, skipTransition: () => pending?.() }
		},
	})
	const push = vi.spyOn(history, "pushState")
	const first = app.navigator.navigate({ to: "_root_/a", viewTransition: { scope: "document" } })
	await vi.waitFor(() => expect(started).toBe(1))
	const second = app.navigator.navigate({ to: "_root_/b", viewTransition: { scope: "document" } })
	await vi.waitFor(() => expect(started).toBe(2))
	await first
	pending?.()
	await second
	flush()
	expect(app.text()).toBe("root[b]")
	expect(location.pathname).toBe("/b")
	expect(push.mock.calls.map((call) => String(call[2]))).toEqual(["/b"])
	push.mockRestore()
})

// A transition that runs its update at once, and answers like a finished one.
function startAt(target: Element | Document, before: () => void = () => undefined, after = before): void {
	Object.defineProperty(target, "startViewTransition", {
		configurable: true,
		value: (update: () => void) => {
			before()
			update()
			after()
			const done = Promise.resolve()
			return { updateCallbackDone: done, ready: done, finished: done, skipTransition: () => undefined }
		},
	})
}

// The old capture shows the page while it is pending: `pending` is still true when the transition's update starts and
// at its commit, and has fallen by the time the update returns, not later (dx/navigate.md `useNavigation()`, B124,
// BUGS.md 119.12).
it("pending until commit", async () => {
	const app = await mountNavigator(router, async () => new Response(aboutFrames.map(encodeFrame).join("")))
	const seen: boolean[] = []
	startAt(document, () => {
		flush()
		seen.push(app.deps.navigation.pending())
	})
	const commit = app.store.commit
	app.store.commit = (next) => {
		const shown = commit(next)
		flush()
		seen.push(app.deps.navigation.pending())
		return shown
	}
	await app.navigator.navigate({ to: "_root_/about" })
	flush()
	seen.push(app.deps.navigation.pending())
	expect(seen).toEqual([true, true, false, false])
})

const homeFrames: Frame[] = [{ t: "l", m: "_root_", d: null }, { t: "l", m: "_root_/", d: "h" }, { t: "r" }]

// A fetch answer the test sets per step.
type Answer = () => Promise<Response>

// After the ends a test drove, `pending` is false, and a later navigation still raises it while it fetches and lowers it
// at its end: an end counted twice or never would break one or the other.
async function stillCounts(
	app: Awaited<ReturnType<typeof mountNavigator>>,
	answer: (next: Answer) => void,
): Promise<void> {
	const pending = (): boolean => {
		flush()
		return app.deps.navigation.pending()
	}
	expect(pending()).toBe(false)
	startAt(document)
	const fetching = Promise.withResolvers<Response>()
	answer(() => fetching.promise)
	const later = app.navigator.navigate({ to: "_root_/" })
	await vi.waitFor(() => expect(pending()).toBe(true))
	fetching.resolve(new Response(homeFrames.map(encodeFrame).join("")))
	await later
	expect(pending()).toBe(false)
}

// Every way a navigation ends lowers `pending` once: a status, a network failure, an abort by a newer navigation, and a
// scoped start that throws and falls back to the document (B119 (3)).
it("pending ends once", async () => {
	let answer: Answer = async () => new Response(aboutFrames.map(encodeFrame).join(""))
	const app = await mountNavigator(router, () => answer())
	startAt(document)
	answer = async () => new Response(null, { status: 404 })
	await app.navigator.navigate({ to: "_root_/about" })
	answer = () => Promise.reject(new TypeError("Failed to fetch"))
	await app.navigator.navigate({ to: "_root_/about" })
	const held = Promise.withResolvers<Response>()
	answer = () => held.promise
	const aborted = app.navigator.navigate({ to: "_root_/about" })
	answer = async () => new Response(homeFrames.map(encodeFrame).join(""))
	await app.navigator.navigate({ to: "_root_/" })
	held.resolve(new Response(aboutFrames.map(encodeFrame).join("")))
	await aborted
	const main = app.host.querySelector("main")
	if (main === null) throw new Error("no main")
	Object.defineProperty(main, "startViewTransition", {
		configurable: true,
		value: () => {
			throw new Error("scoped start refused")
		},
	})
	answer = async () => new Response(aboutFrames.map(encodeFrame).join(""))
	await app.navigator.navigate({ to: "_root_/about", viewTransition: { scope: "auto" } })
	expect(app.text()).toBe("root[about]")
	await stillCounts(app, (next) => (answer = next))
})

// A running transition the next navigation skips (B119 (1)) lowers the skipped navigation's `pending` once too.
const answerHome: Answer = async () => new Response(homeFrames.map(encodeFrame).join(""))

it("pending ends once, skipped", async () => {
	let answer = answerHome
	const app = await mountNavigator(router, () => answer())
	let run: (() => void) | undefined
	Object.defineProperty(document, "startViewTransition", {
		configurable: true,
		value: (update: () => void) => {
			run?.()
			const { promise, resolve } = Promise.withResolvers<void>()
			run = () => {
				run = undefined
				update()
				resolve()
			}
			return { updateCallbackDone: promise, ready: promise, finished: promise, skipTransition: () => run?.() }
		},
	})
	const skipped = app.navigator.navigate({ to: "_root_/about" })
	await vi.waitFor(() => expect(run).toBeDefined())
	answer = async () => new Response(aboutFrames.map(encodeFrame).join(""))
	const last = app.navigator.navigate({ to: "_root_/about", replace: true })
	await skipped
	run?.()
	await last
	expect(app.text()).toBe("root[about]")
	await stillCounts(app, (next) => (answer = next))
})
