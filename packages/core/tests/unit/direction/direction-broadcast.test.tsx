import { render } from "solid-js/web"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DirectionProvider, useDirection } from "../../../src/direction.ts"

function tick(): Promise<void> {
	return new Promise((r) => setTimeout(r, 0))
}

function fireStorageEvent(
	key: string,
	newValue: string | null,
	storageArea = localStorage,
): void {
	/* jsdom rejects a non-jsdom Storage on StorageEventInit. Dispatch a
	   storage-shaped Event so storageArea can be the same object the app reads. */
	const event = new Event("storage") as StorageEvent
	Object.defineProperties(event, {
		key: { value: key },
		newValue: { value: newValue },
		storageArea: { value: storageArea },
	})
	window.dispatchEvent(event)
}

let container: HTMLDivElement
let dispose: (() => void) | undefined

beforeEach(() => {
	container = document.createElement("div")
	document.body.appendChild(container)
	localStorage.clear()
	document.documentElement.removeAttribute("data-dir")
	document.documentElement.removeAttribute("dir")
})

afterEach(() => {
	dispose?.()
	dispose = undefined
	container.remove()
	vi.restoreAllMocks()
})

describe("DirectionProvider cross-tab sync via StorageEvent", () => {
	it("ltr → rtl from other tab", async () => {
		let getter: (() => string) | undefined
		dispose = render(
			() => (
				<DirectionProvider config={{ defaultDir: "ltr" }}>
					{(() => {
						const ctx = useDirection()
						getter = ctx.direction
						return null
					})()}
				</DirectionProvider>
			),
			container,
		)
		await tick()
		expect(getter?.()).toBe("ltr")

		fireStorageEvent("flare.dir", "rtl")
		await tick()
		expect(getter?.()).toBe("rtl")
	})

	it("rtl → ltr from other tab", async () => {
		localStorage.setItem("flare.dir", "rtl")
		let getter: (() => string) | undefined
		dispose = render(
			() => (
				<DirectionProvider>
					{(() => {
						const ctx = useDirection()
						getter = ctx.direction
						return null
					})()}
				</DirectionProvider>
			),
			container,
		)
		await tick()
		expect(getter?.()).toBe("rtl")

		fireStorageEvent("flare.dir", "ltr")
		await tick()
		expect(getter?.()).toBe("ltr")
	})

	it("invalid value 'auto' ignored", async () => {
		let getter: (() => string) | undefined
		dispose = render(
			() => (
				<DirectionProvider config={{ defaultDir: "ltr" }}>
					{(() => {
						const ctx = useDirection()
						getter = ctx.direction
						return null
					})()}
				</DirectionProvider>
			),
			container,
		)
		await tick()

		fireStorageEvent("flare.dir", "auto")
		await tick()
		expect(getter?.()).toBe("ltr")
	})

	it("wrong key ignored", async () => {
		let getter: (() => string) | undefined
		dispose = render(
			() => (
				<DirectionProvider config={{ defaultDir: "ltr" }}>
					{(() => {
						const ctx = useDirection()
						getter = ctx.direction
						return null
					})()}
				</DirectionProvider>
			),
			container,
		)
		await tick()

		fireStorageEvent("other.key", "rtl")
		await tick()
		expect(getter?.()).toBe("ltr")
	})

	it("null newValue ignored", async () => {
		let getter: (() => string) | undefined
		dispose = render(
			() => (
				<DirectionProvider config={{ defaultDir: "ltr" }}>
					{(() => {
						const ctx = useDirection()
						getter = ctx.direction
						return null
					})()}
				</DirectionProvider>
			),
			container,
		)
		await tick()

		fireStorageEvent("flare.dir", null)
		await tick()
		expect(getter?.()).toBe("ltr")
	})

	it("cleanup removes storage listener on unmount", async () => {
		const removeSpy = vi.spyOn(window, "removeEventListener")
		dispose = render(
			() => (
				<DirectionProvider>
					{(() => {
						useDirection()
						return null
					})()}
				</DirectionProvider>
			),
			container,
		)
		await tick()

		dispose?.()
		dispose = undefined

		const storageCalls = removeSpy.mock.calls.filter((c) => c[0] === "storage")
		expect(storageCalls.length).toBeGreaterThan(0)
	})

	it("custom storageKey responds to correct key", async () => {
		let getter: (() => string) | undefined
		dispose = render(
			() => (
				<DirectionProvider config={{ storageKey: "my.dir" }}>
					{(() => {
						const ctx = useDirection()
						getter = ctx.direction
						return null
					})()}
				</DirectionProvider>
			),
			container,
		)
		await tick()

		fireStorageEvent("my.dir", "rtl")
		await tick()
		expect(getter?.()).toBe("rtl")

		fireStorageEvent("flare.dir", "ltr")
		await tick()
		expect(getter?.()).toBe("rtl")
	})

	it("StorageEvent also updates DOM attributes", async () => {
		dispose = render(
			() => (
				<DirectionProvider config={{ defaultDir: "ltr" }}>
					{(() => {
						useDirection()
						return null
					})()}
				</DirectionProvider>
			),
			container,
		)
		await tick()

		fireStorageEvent("flare.dir", "rtl")
		await tick()
		expect(document.documentElement.getAttribute("data-dir")).toBe("rtl")
		expect(document.documentElement.getAttribute("dir")).toBe("rtl")
	})

	it("sessionStorage storageArea ignored", async () => {
		let getter: (() => string) | undefined
		dispose = render(
			() => (
				<DirectionProvider config={{ defaultDir: "ltr" }}>
					{(() => {
						const ctx = useDirection()
						getter = ctx.direction
						return null
					})()}
				</DirectionProvider>
			),
			container,
		)
		await tick()

		fireStorageEvent("flare.dir", "rtl", sessionStorage)
		await tick()
		expect(getter?.()).toBe("ltr")
	})

	it("SSR: no window.addEventListener called when sharedConfig.context set", async () => {
		const addSpy = vi.spyOn(window, "addEventListener")
		const { sharedConfig } = await import("solid-js")
		const original = sharedConfig.context
		try {
			Object.defineProperty(sharedConfig, "context", {
				configurable: true,
				value: { count: 0, id: "test" },
			})
			DirectionProvider({
				children: null as unknown as import("solid-js").JSX.Element,
			})
			const storageCalls = addSpy.mock.calls.filter((c) => c[0] === "storage")
			expect(storageCalls).toHaveLength(0)
		} finally {
			Object.defineProperty(sharedConfig, "context", {
				configurable: true,
				value: original,
			})
		}
	})
})
