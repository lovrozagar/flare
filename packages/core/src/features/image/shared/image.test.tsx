import { createComponent, createMemo, createSignal, flush, Loading, Show } from "solid-js"
import { render } from "@solidjs/web"
import { afterEach, expect, it, vi } from "vitest"
import { Image, type ImageBinding, type ImageProps } from "./image.tsx"
import { expectReported } from "../../../shared/dev/reported.fixture.ts"

// The plugin's widths, as flare({ image: { widths } }) writes them into config.ts. `hydrating` stands for a render
// that hydrates the server's markup.
const plugin = vi.hoisted(() => ({ widths: [320, 640, 1280, 1920] as readonly number[], hydrating: false }))

vi.mock("solid-js", async (original) => {
	const actual = await original<typeof import("solid-js")>()
	return { ...actual, isHydrating: () => plugin.hydrating || actual.isHydrating() }
})

vi.mock("./config.ts", async (original) => ({
	...(await original<typeof import("./config.ts")>()),
	get imageWidths() {
		return plugin.widths
	},
}))

afterEach(() => {
	document.body.replaceChildren()
	plugin.widths = [320, 640, 1280, 1920]
	plugin.hydrating = false
	vi.unstubAllEnvs()
})

const photo: ImageBinding = {
	src: "/a-1920.webp",
	width: 2400,
	height: 1200,
	variants: [320, 640, 1280, 1920].map((width) => ({ width, src: `/a-${width}.webp` })),
}

// Rendered on the page, where a client-rendered image takes its sources (BUGS.md 246).
function img(props: ImageProps): HTMLImageElement {
	const host = document.createElement("div")
	document.body.append(host)
	render(() => createComponent(Image, props), host)
	flush()
	const found = host.querySelector("img")
	if (found === null) throw new Error("no img")
	return found
}

function mount(props: ImageProps): () => HTMLImageElement {
	return () => img(props)
}

it("srcset", () => {
	const element = img({ alt: "a", src: photo, widths: [320, 640] })
	expect(element.getAttribute("srcset")).toBe("/a-320.webp 320w, /a-640.webp 640w")
	expect(element.getAttribute("src")).toBe("/a-1920.webp")
	expect(img({ alt: "a", src: photo }).getAttribute("srcset")).toBe(
		"/a-320.webp 320w, /a-640.webp 640w, /a-1280.webp 1280w, /a-1920.webp 1920w",
	)
	// A string src is used as it is, with no srcset and no intrinsic ratio.
	const plain = img({ alt: "a", src: "/plain.png", maxWidth: 300 })
	expect([plain.getAttribute("src"), plain.hasAttribute("srcset"), plain.style.aspectRatio]).toEqual([
		"/plain.png",
		false,
		"",
	])
	// A width the plugin did not list throws.
	expectReported(mount({ alt: "a", src: photo, widths: [321] }), "Image width 321 is not one of the plugin widths")
})

it("alt required", () => {
	// @ts-expect-error alt is required; an empty string marks a decorative image
	const props: ImageProps = { src: photo }
	expect(img({ ...props, alt: "" }).getAttribute("alt")).toBe("")
})

it("sizes", () => {
	expect(img({ alt: "a", src: photo, sizes: "50vw" }).getAttribute("sizes")).toBe("50vw")
	expect(img({ alt: "a", src: photo }).hasAttribute("sizes")).toBe(false)
})

it("priority", () => {
	const eager = img({ alt: "a", src: photo, priority: true })
	expect([eager.getAttribute("loading"), eager.getAttribute("decoding"), eager.getAttribute("fetchpriority")]).toEqual([
		"eager",
		"sync",
		"high",
	])
	const lazy = img({ alt: "a", src: photo })
	expect([lazy.getAttribute("loading"), lazy.getAttribute("decoding"), lazy.hasAttribute("fetchpriority")]).toEqual([
		"lazy",
		"async",
		false,
	])
})

it("blur missing", () => {
	expectReported(mount({ alt: "a", src: photo, placeholder: "blur" }), "Image placeholder blur needs a blurDataURL")
})

it("blur until load", () => {
	const element = img({ alt: "a", src: photo, placeholder: "blur", blurDataURL: "data:image/png;base64,AAAA" })
	expect(element.style.backgroundImage).toBe('url("data:image/png;base64,AAAA")')
	expect(element.style.backgroundSize).toBe("cover")
	element.dispatchEvent(new Event("load"))
	flush()
	expect(element.style.backgroundImage).toBe("")
	expect(element.style.backgroundSize).toBe("")
})

// A priority image often finishes before hydrate attaches onLoad, so its load event is never heard. The blur clears
// once the hydrated image reports it is complete (BUGS.md B20).
it("complete before hydrate", async () => {
	plugin.hydrating = true
	const complete = vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true)
	const element = img({
		alt: "a",
		src: photo,
		priority: true,
		placeholder: "blur",
		blurDataURL: "data:image/png;base64,AAAA",
	})
	await Promise.resolve()
	flush()
	complete.mockRestore()
	expect(element.style.backgroundImage).toBe("")
	// One still loading keeps its blur until its load event.
	const loading = vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(false)
	const pending = img({ alt: "a", src: photo, placeholder: "blur", blurDataURL: "data:image/png;base64,AAAA" })
	await Promise.resolve()
	flush()
	loading.mockRestore()
	expect(pending.style.backgroundImage).not.toBe("")
})

it("blur scheme", () => {
	const element = img({ alt: "a", src: photo, placeholder: "blur", blurDataURL: "https://evil.test/a.png" })
	expect(element.style.backgroundImage).toBe("")
})

it("fill", () => {
	const element = img({ alt: "a", src: photo, fill: true })
	expect(element.hasAttribute("width")).toBe(false)
	expect(element.hasAttribute("height")).toBe(false)
	const style = element.style
	expect([style.position, style.inset, style.objectFit, style.aspectRatio]).toEqual([
		"absolute",
		"0",
		"cover",
		"2400 / 1200",
	])
	expect(element.getAttribute("srcset")).toBe(
		"/a-320.webp 320w, /a-640.webp 640w, /a-1280.webp 1280w, /a-1920.webp 1920w",
	)
	expectReported(mount({ alt: "a", src: photo, fill: true, ...({ width: 10 } as object) }), "Image fill takes no width")
})

it("fixed", () => {
	expectReported(mount({ alt: "a", src: photo, ...({ fixed: true } as object) }), "Image fixed needs width and height")
	const element = img({ alt: "a", src: photo, fixed: true, width: 640, height: 320 })
	expect([element.getAttribute("width"), element.getAttribute("height")]).toEqual(["640", "320"])
	expect([element.style.width, element.style.height]).toEqual(["640px", "320px"])
	expectReported(
		mount({ alt: "a", src: photo, fixed: true, width: 600, height: 300 }),
		"Image width 600 is not one of the plugin widths",
	)
})

it("fixed 2x", () => {
	expect(img({ alt: "a", src: photo, fixed: true, width: 640, height: 320 }).getAttribute("srcset")).toBe(
		"/a-640.webp 1x, /a-1280.webp 2x",
	)
	plugin.widths = [320, 640, 1920]
	expect(img({ alt: "a", src: photo, fixed: true, width: 640, height: 320 }).getAttribute("srcset")).toBe(
		"/a-640.webp 1x",
	)
	// A configured width the image had no variant for leaves no srcset.
	plugin.widths = [320, 640, 1920, 3000]
	expect(img({ alt: "a", src: photo, fixed: true, width: 3000, height: 10 }).hasAttribute("srcset")).toBe(false)
})

it("responsive", () => {
	const tall = img({ alt: "a", src: photo, maxWidth: 400, maxHeight: 200 })
	expect([tall.style.width, tall.style.maxWidth, tall.style.maxHeight, tall.style.aspectRatio]).toEqual([
		"100%",
		"400px",
		"200px",
		"400 / 200",
	])
	expect(tall.getAttribute("srcset")).toBe("/a-320.webp 320w, /a-640.webp 640w")
	expect(img({ alt: "a", src: photo, maxWidth: 400 }).style.aspectRatio).toBe("2400 / 1200")
	const ratio = img({ alt: "a", src: photo, maxWidth: 700, aspectRatio: 1.5 })
	expect(ratio.style.aspectRatio).toBe("1.5")
	expect(ratio.getAttribute("srcset")).toBe("/a-320.webp 320w, /a-640.webp 640w, /a-1280.webp 1280w")
})

it("two modes", () => {
	expectReported(
		mount({ alt: "a", src: photo, ...({ fill: true, maxWidth: 400 } as object) }),
		"Image takes one of fill, fixed, and maxWidth",
	)
	expectReported(
		mount({ alt: "a", src: photo, ...({ fixed: true, width: 640, height: 1, fill: true } as object) }),
		"Image takes one of fill, fixed, and maxWidth",
	)
})

// A client-rendered image takes its sources only once it is on the page, so Chromium never selects one while the image
// belongs to Solid's template document, whose viewport listeners would keep it and the page around it for good. Its
// load event, not `complete`, which an image with no source reports, clears the blur (BUGS.md 246).
it("sources once placed", () => {
	const writes: string[] = []
	const original = Element.prototype.setAttribute
	Element.prototype.setAttribute = function (name: string, value: string) {
		if (["src", "srcset", "sizes"].includes(name)) writes.push(`${name} ${String(this.isConnected)}`)
		original.call(this, name, value)
	}
	const host = document.createElement("div")
	document.body.append(host)
	try {
		const props: ImageProps = { alt: "a", src: photo, sizes: "50vw", placeholder: "blur", blurDataURL: "data:x" }
		render(() => createComponent(Image, props), host)
		flush()
		expect(writes.sort()).toEqual(["sizes true", "src true", "srcset true"])
		expect(host.querySelector("img")?.style.backgroundImage).not.toBe("")
	} finally {
		Element.prototype.setAttribute = original
		host.remove()
	}
})

// An image under a boundary whose data arrives after the first settle is built off the page while the boundary
// waits; it still takes its sources only once it is on the page (BUGS.md 246).
it("placed after a boundary", async () => {
	const writes: string[] = []
	const original = Element.prototype.setAttribute
	Element.prototype.setAttribute = function (name: string, value: string) {
		if (["src", "srcset", "sizes"].includes(name)) writes.push(`${name} ${String(this.isConnected)}`)
		original.call(this, name, value)
	}
	const host = document.createElement("div")
	document.body.append(host)
	const later = Promise.withResolvers<string>()
	try {
		render(
			() =>
				createComponent(Loading, {
					fallback: "wait",
					get children() {
						const value = createMemo(async () => later.promise)
						return [() => value(), createComponent(Image, { alt: "a", src: photo, sizes: "50vw" })]
					},
				}),
			host,
		)
		flush()
		expect(host.textContent).toBe("wait")
		later.resolve("ready")
		await vi.waitFor(() => expect(host.querySelector("img")?.hasAttribute("src")).toBe(true))
		expect(host.querySelector("img")?.getAttribute("src")).toBe("/a-1920.webp")
		expect(writes.sort()).toEqual(["sizes true", "src true", "srcset true"])
	} finally {
		Element.prototype.setAttribute = original
		host.remove()
	}
})

// An image disposed while its render still waits on data, before it settles, takes no sources and leaves nothing
// running: its settle callback is the component's own, which disposal drops; one tied to no owner would still run
// once the data arrived and look for a page the image never reaches (BUGS.md 290).
it("disposed before settle", async () => {
	vi.useFakeTimers()
	const host = document.createElement("div")
	document.body.append(host)
	const later = Promise.withResolvers<string>()
	try {
		const dispose = render(() => {
			const value = createMemo(async () => later.promise)
			return [() => value(), createComponent(Image, { alt: "a", src: photo })]
		}, host)
		const element = host.querySelector("img")
		dispose()
		later.resolve("ready")
		await vi.advanceTimersByTimeAsync(100)
		expect([element?.hasAttribute("src") ?? false, vi.getTimerCount()]).toEqual([false, 0])
	} finally {
		vi.useRealTimers()
		host.remove()
	}
})

// An image in a document with no window, which no page shows, never takes its sources; one in a frame's document
// would, since its document has a window (BUGS.md 290).
it("document without a window", () => {
	const detached = document.implementation.createHTMLDocument("detached")
	const host = detached.createElement("div")
	detached.body.append(host)
	const dispose = render(() => createComponent(Image, { alt: "a", src: photo }), host)
	flush()
	expect(host.querySelector("img")?.hasAttribute("src")).toBe(false)
	dispose()
})

// An image made before it is placed, held for a <Show> that opens later or rendered into a container appended later,
// takes its sources once it lands on the page (BUGS.md 293).
it("placed later", async () => {
	const host = document.createElement("div")
	document.body.append(host)
	const [open, setOpen] = createSignal(false)
	const dispose = render(() => {
		const held = createComponent(Image, { alt: "a", src: photo })
		return createComponent(Show, {
			get when() {
				return open()
			},
			children: held as never,
		})
	}, host)
	flush()
	setOpen(true)
	flush()
	await vi.waitFor(() => expect(host.querySelector("img")?.getAttribute("src")).toBe("/a-1920.webp"))
	dispose()
	// Two containers appended one after the other: the first lands while the second still waits.
	const later = document.createElement("div")
	const last = document.createElement("div")
	const stop = render(() => createComponent(Image, { alt: "b", src: photo }), later)
	const end = render(() => createComponent(Image, { alt: "c", src: photo }), last)
	flush()
	expect(later.querySelector("img")?.hasAttribute("src")).toBe(false)
	document.body.append(later)
	await vi.waitFor(() => expect(later.querySelector("img")?.getAttribute("src")).toBe("/a-1920.webp"))
	expect(last.querySelector("img")?.hasAttribute("src")).toBe(false)
	document.body.append(last)
	await vi.waitFor(() => expect(last.querySelector("img")?.getAttribute("src")).toBe("/a-1920.webp"))
	stop()
	end()
	last.remove()
	host.remove()
	later.remove()
})

// An image disposed while it waits for the page stops waiting, and with none left nothing observes the page: a
// container appended afterwards places nothing (BUGS.md 293).
it("disposed while waiting", async () => {
	const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect")
	const later = document.createElement("div")
	const stop = render(() => createComponent(Image, { alt: "a", src: photo }), later)
	flush()
	const img = later.querySelector("img")
	stop()
	expect(disconnect).toHaveBeenCalled()
	disconnect.mockRestore()
	// Disposing took the img out of `later`, so the img itself goes on the page: placed after its owner is gone, it
	// takes no sources, since the wait ended with it.
	document.body.append(later, img as HTMLImageElement)
	await Promise.resolve()
	expect(img?.hasAttribute("src")).toBe(false)
})
