import { createComponent, createSignal, flush, untrack, type Setter } from "solid-js"
import { render, type JSX } from "@solidjs/web"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { RouterContext } from "../../../shared/router/context.ts"
import { createRouter, type Router } from "../../../shared/router/create-router.ts"
import type { DirectionOptions } from "../../../shared/router/features.ts"
import { DirectionProvider, useDirection } from "./provider.tsx"

// DirectionProvider on Solid's client build. The server rows are provider.ssr.test.ts.
const flags = vi.hoisted(() => ({ enabled: true }))

vi.mock("../../../client/sync/enabled.ts", () => ({
	get broadcastEnabled() {
		return flags.enabled
	},
}))

type Direction = ReturnType<typeof useDirection>

// Node's own `localStorage` global shadows the document's. The browser has one, the document's, which jsdom holds.
const documentStorage = (globalThis as unknown as { jsdom: { window: Window } }).jsdom.window.localStorage

beforeEach(() => {
	vi.stubGlobal("localStorage", documentStorage)
})

afterEach(() => {
	flags.enabled = true
	documentStorage.clear()
	document.documentElement.removeAttribute("dir")
	document.documentElement.removeAttribute("data-dir")
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

function routerWith(direction?: DirectionOptions): Router {
	return createRouter({ layouts: {}, routeTree: [], ...(direction && { direction }) })
}

type Mounted = { direction: Direction; first: string; setLocale: Setter<string>; dispose: () => void }

// Mounts the provider under a locale signal, and returns the hook's value, the dir the hydration render saw, the
// locale setter, and the unmount.
function mount(locale = "en", router = routerWith({})): Mounted {
	const [tag, setLocale] = createSignal(locale)
	const seen: { direction?: Direction; first?: string } = {}
	const tree = (): JSX.Element =>
		createComponent(RouterContext, {
			value: router,
			get children() {
				return createComponent(DirectionProvider, {
					get locale() {
						return tag()
					},
					get children() {
						seen.direction = useDirection()
						seen.first = untrack(seen.direction.direction)
						return "child"
					},
				})
			},
		})
	const dispose = render(tree, document.createElement("div"))
	flush()
	if (seen.direction === undefined || seen.first === undefined) throw new Error("not mounted")
	return { direction: seen.direction, first: seen.first, setLocale, dispose }
}

function dir(name = "dir"): string | null {
	return document.documentElement.getAttribute(name)
}

const PROBE = "probe"

// Another tab's posts, then a probe: once the probe arrives, every post before it has been heard.
async function deliver(...messages: unknown[]): Promise<void> {
	const sender = new BroadcastChannel("flare.sync")
	const done = new Promise<void>((resolve) => {
		const tail = new BroadcastChannel("flare.sync")
		tail.onmessage = (event: MessageEvent<unknown>) => {
			if (event.data !== PROBE) return
			tail.close()
			resolve()
		}
	})
	for (const message of messages) sender.postMessage(message)
	sender.postMessage(PROBE)
	await done
	await new Promise((resolve) => setTimeout(resolve, 0))
	sender.close()
	flush()
}

// What other tabs hear while `run` runs.
async function posted(run: () => void): Promise<unknown[]> {
	const heard: unknown[] = []
	const listener = new BroadcastChannel("flare.sync")
	listener.onmessage = (event: MessageEvent<unknown>) => void heard.push(event.data)
	run()
	await deliver()
	listener.close()
	return heard.filter((data) => data !== PROBE)
}

it("change", () => {
	const { direction, setLocale, dispose } = mount("en")
	setLocale("ar")
	flush()
	expect(direction.direction()).toBe("rtl")
	expect(dir()).toBe("rtl")
	expect(documentStorage.getItem("flare.dir")).toBeNull()
	dispose()
})

it("stored wins", () => {
	documentStorage.setItem("flare.dir", "ltr")
	const { direction, setLocale, dispose } = mount("en")
	setLocale("ar")
	flush()
	expect(direction.direction()).toBe("ltr")
	expect(dir()).not.toBe("rtl")
	dispose()
})

it("set", () => {
	const { direction, dispose } = mount("en", routerWith({ attribute: "data-dir" }))
	direction.setDirection("rtl")
	flush()
	expect(documentStorage.getItem("flare.dir")).toBe("rtl")
	expect(direction.direction()).toBe("rtl")
	expect([dir(), dir("data-dir")]).toEqual(["rtl", "rtl"])
	// A storage throw is ignored, and the attribute still updates.
	vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
		throw new Error("full")
	})
	direction.setDirection("ltr")
	expect(dir()).toBe("ltr")
	dispose()
})

it("clear", () => {
	documentStorage.setItem("flare.dir", "ltr")
	const { direction, dispose } = mount("ar")
	direction.setDirection()
	flush()
	expect(documentStorage.getItem("flare.dir")).toBeNull()
	expect(direction.direction()).toBe("rtl")
	expect(dir()).toBe("rtl")
	direction.setDirection("ltr")
	direction.setDirection(undefined)
	flush()
	expect(dir()).toBe("rtl")
	vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
		throw new Error("denied")
	})
	expect(() => direction.setDirection()).not.toThrow()
	dispose()
})

it("bad set", () => {
	const { direction, dispose } = mount("en")
	// @ts-expect-error a locale tag or `auto` is not a dir
	expect(() => direction.setDirection("auto")).toThrow("setDirection auto")
	expect(documentStorage.getItem("flare.dir")).toBeNull()
	dispose()
})

it("no config", () => {
	const host = document.createElement("div")
	const errors: unknown[] = []
	const tree = (): JSX.Element =>
		createComponent(RouterContext, {
			value: routerWith(),
			get children() {
				return createComponent(DirectionProvider, {
					get children() {
						try {
							useDirection()
						} catch (error) {
							errors.push(error)
						}
						return "child"
					},
				})
			},
		})
	const dispose = render(tree, host)
	flush()
	expect(host.textContent).toBe("child")
	expect(String(errors[0])).toMatch(/DirectionProvider/)
	dispose()
})

it("hydrate", () => {
	documentStorage.setItem("flare.dir", "rtl")
	const { direction, first, dispose } = mount("en")
	expect(first).toBe("ltr")
	expect(direction.direction()).toBe("rtl")
	dispose()
	vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
		throw new Error("denied")
	})
	const denied = mount("ar")
	expect(denied.direction.direction()).toBe("rtl")
	denied.dispose()
})

it("direction channel", async () => {
	const { direction, dispose } = mount("en")
	await deliver({ type: "direction", value: "rtl" })
	expect(direction.direction()).toBe("rtl")
	expect(dir()).toBe("rtl")
	await deliver({ type: "direction", value: null })
	expect(direction.direction()).toBe("ltr")
	expect(dir()).toBe("ltr")
	expect(documentStorage.getItem("flare.dir")).toBeNull()
	window.dispatchEvent(new StorageEvent("storage", { key: "flare.dir", newValue: "rtl" }))
	await deliver(
		{ type: "direction", value: "auto" },
		{ type: "direction", value: "rtl", extra: 1 },
		{ type: "direction", other: "rtl" },
		{ type: "theme" },
		7,
	)
	expect(direction.direction()).toBe("ltr")
	expect(await posted(() => direction.setDirection())).toEqual([{ type: "direction", value: null }])
	dispose()
})

it("direction channel same", async () => {
	documentStorage.setItem("flare.dir", "rtl")
	const { direction, dispose } = mount("en")
	const write = vi.spyOn(Storage.prototype, "setItem")
	await deliver({ type: "direction", value: "rtl" })
	expect(direction.direction()).toBe("rtl")
	expect(dir()).toBe("rtl")
	expect(write).not.toHaveBeenCalled()
	dispose()
})

it("direction channel quiet", async () => {
	flags.enabled = false
	const off = mount("en")
	expect(await posted(() => off.direction.setDirection("rtl"))).toEqual([])
	expect(documentStorage.getItem("flare.dir")).toBe("rtl")
	off.dispose()
	flags.enabled = true
	vi.stubGlobal("BroadcastChannel", undefined)
	const missing = mount("en")
	missing.direction.setDirection("ltr")
	expect(documentStorage.getItem("flare.dir")).toBe("ltr")
	missing.dispose()
})

it("no toggle", () => {
	const { direction, dispose } = mount("en")
	expect(Object.keys(direction).sort()).toEqual(["direction", "setDirection"])
	expect(direction).not.toHaveProperty("toggleDirection")
	expect(direction).not.toHaveProperty("getDirFromLocale")
	dispose()
})
