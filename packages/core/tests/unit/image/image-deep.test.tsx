import { render } from "solid-js/web"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ImageLoader } from "../../../src/image/index.tsx"
import {
	buildStaticSrcSet,
	configureImage,
	generateSrcSet,
	Image,
	isStaticImage,
	resetImageConfig,
} from "../../../src/image/index.tsx"

let container: HTMLDivElement
let dispose: (() => void) | undefined

beforeEach(() => {
	container = document.createElement("div")
	document.body.appendChild(container)
	resetImageConfig()
})

afterEach(() => {
	dispose?.()
	dispose = undefined
	container.remove()
})

const testLoader: ImageLoader = ({ quality, src, width }) =>
	`/_img?src=${encodeURIComponent(src)}&w=${width}&q=${quality}`

/* ── generateSrcSet ── */

describe("generateSrcSet width mode", () => {
	it("filters breakpoints by maxWidth * 2 cap", () => {
		const srcset = generateSrcSet({
			baseWidth: 500,
			loader: testLoader,
			maxWidth: 500,
			mode: "width",
			quality: 75,
			src: "/photo.jpg",
			widths: undefined,
		})
		const widths = srcset?.match(/(\d+)w/g)?.map((w) => Number.parseInt(w)) ?? []
		for (const w of widths) {
			expect(w).toBeLessThanOrEqual(1000)
		}
		expect(widths).toContain(500)
	})

	it("no maxWidth cap (fill mode) — includes all default widths", () => {
		const srcset = generateSrcSet({
			baseWidth: 3840,
			loader: testLoader,
			maxWidth: undefined,
			mode: "width",
			quality: 75,
			src: "/photo.jpg",
			widths: undefined,
		})
		expect(srcset).toContain("3840w")
		expect(srcset).toContain("640w")
		expect(srcset).toContain("1920w")
	})

	it("includes baseWidth even if not in breakpoints", () => {
		const srcset = generateSrcSet({
			baseWidth: 999,
			loader: testLoader,
			maxWidth: 999,
			mode: "width",
			quality: 75,
			src: "/photo.jpg",
			widths: undefined,
		})
		expect(srcset).toContain("w=999")
	})

	it("custom widths override defaults", () => {
		const srcset = generateSrcSet({
			baseWidth: 600,
			loader: testLoader,
			maxWidth: 600,
			mode: "width",
			quality: 75,
			src: "/photo.jpg",
			widths: [300, 600, 1200],
		})
		expect(srcset).toContain("w=300")
		expect(srcset).toContain("w=600")
		expect(srcset).toContain("w=1200")
		expect(srcset).not.toContain("w=640")
	})

	it("entries sorted ascending", () => {
		const srcset = generateSrcSet({
			baseWidth: 500,
			loader: testLoader,
			maxWidth: 500,
			mode: "width",
			quality: 75,
			src: "/photo.jpg",
			widths: [100, 500, 300],
		})
		const widths = srcset?.match(/(\d+)w/g)?.map((w) => Number.parseInt(w))
		expect(widths).toEqual([100, 300, 500])
	})

	it("does not include 0w when baseWidth is 0", () => {
		const srcset = generateSrcSet({
			baseWidth: 0,
			loader: testLoader,
			maxWidth: undefined,
			mode: "width",
			quality: 75,
			src: "/photo.jpg",
			widths: [300, 600, 900],
		})
		const widths = srcset?.match(/(\d+)w/g)?.map((w) => Number.parseInt(w)) ?? []
		expect(widths).not.toContain(0)
		expect(widths).toEqual([300, 600, 900])
	})

	it("returns undefined when no valid entries and baseWidth is 0", () => {
		const srcset = generateSrcSet({
			baseWidth: 0,
			loader: testLoader,
			maxWidth: 50,
			mode: "width",
			quality: 75,
			src: "/photo.jpg",
			widths: [300, 600],
		})
		/* All widths filtered by cap (100), baseWidth 0 excluded → no entries */
		expect(srcset).toBeUndefined()
	})
})

describe("generateSrcSet density mode", () => {
	it("returns 1x and 2x descriptors", () => {
		const srcset = generateSrcSet({
			baseWidth: 400,
			loader: testLoader,
			mode: "density",
			quality: 75,
			src: "/photo.jpg",
			widths: undefined,
		})
		expect(srcset).toContain("1x")
		expect(srcset).toContain("2x")
		expect(srcset).toContain("w=400")
		expect(srcset).toContain("w=800")
	})

	it("quality parameter passed through", () => {
		const srcset = generateSrcSet({
			baseWidth: 400,
			loader: testLoader,
			mode: "density",
			quality: 90,
			src: "/photo.jpg",
			widths: undefined,
		})
		expect(srcset).toContain("q=90")
	})
})

/* ── Style merge ordering ── */

describe("style merge ordering", () => {
	it("layout styles always present (responsive)", () => {
		dispose = render(
			() => <Image alt="test" maxHeight={600} maxWidth={900} src="/photo.jpg" />,
			container,
		)
		const img = container.querySelector("img")
		const style = img?.getAttribute("style") ?? ""
		expect(style).toContain("max-width: 900px")
		expect(style).toContain("width: 100%")
		expect(style).toContain("aspect-ratio: 900 / 600")
	})

	it("layout + blur merged", () => {
		dispose = render(
			() => (
				<Image
					alt="test"
					blurDataURL="data:image/png;base64,abc"
					maxHeight={600}
					maxWidth={900}
					placeholder="blur"
					src="/photo.jpg"
				/>
			),
			container,
		)
		const img = container.querySelector("img")
		const style = img?.getAttribute("style") ?? ""
		expect(style).toContain("max-width: 900px")
		expect(style).toContain("background-image")
	})

	it("layout + blur + user object merged — user wins", () => {
		dispose = render(
			() => (
				<Image
					alt="test"
					blurDataURL="data:image/png;base64,abc"
					maxHeight={600}
					maxWidth={900}
					placeholder="blur"
					src="/photo.jpg"
					style={{ "max-width": "500px" }}
				/>
			),
			container,
		)
		const img = container.querySelector("img")
		const style = img?.getAttribute("style") ?? ""
		/* user override wins over layout */
		expect(style).toContain("max-width: 500px")
		expect(style).toContain("background-image")
	})

	it("layout + user string merged", () => {
		dispose = render(
			() => (
				<Image
					alt="test"
					maxHeight={600}
					maxWidth={900}
					src="/photo.jpg"
					style={{ "border": "1px solid red" }}
				/>
			),
			container,
		)
		const img = container.querySelector("img")
		const style = img?.getAttribute("style") ?? ""
		expect(style).toContain("max-width: 900px")
		expect(style).toContain("border: 1px solid red")
	})

	it("onLoad clears blur but keeps layout (responsive)", async () => {
		dispose = render(
			() => (
				<Image
					alt="test"
					blurDataURL="data:image/png;base64,abc"
					maxHeight={600}
					maxWidth={900}
					placeholder="blur"
					src="/photo.jpg"
				/>
			),
			container,
		)
		const img = container.querySelector("img")
		expect(img?.getAttribute("style")).toContain("background-image")

		img?.dispatchEvent(new Event("load"))
		await new Promise((r) => setTimeout(r, 0))

		const styleAfter = img?.getAttribute("style") ?? ""
		expect(styleAfter).not.toContain("background-image")
		expect(styleAfter).toContain("max-width: 900px")
		expect(styleAfter).toContain("aspect-ratio")
	})

	it("onLoad clears blur but keeps layout (fixed)", async () => {
		dispose = render(
			() => (
				<Image
					alt="test"
					blurDataURL="data:image/png;base64,abc"
					fixed
					height={48}
					placeholder="blur"
					src="/icon.png"
					width={48}
				/>
			),
			container,
		)
		const img = container.querySelector("img")
		expect(img?.getAttribute("style")).toContain("background-image")

		img?.dispatchEvent(new Event("load"))
		await new Promise((r) => setTimeout(r, 0))

		const styleAfter = img?.getAttribute("style") ?? ""
		expect(styleAfter).not.toContain("background-image")
		expect(styleAfter).toContain("width: 48px")
		expect(styleAfter).toContain("height: 48px")
	})
})

/* ── Mode-specific deep tests ── */

describe("responsive mode deep", () => {
	it("loader receives maxWidth as width param", () => {
		const spy: ImageLoader = vi.fn(() => "/out.jpg")
		dispose = render(
			() => <Image alt="test" loader={spy} maxHeight={600} maxWidth={1200} src="/in.jpg" />,
			container,
		)
		const calls = vi.mocked(spy).mock.calls
		const srcCall = calls.find((c) => c[0].width === 1200)
		expect(srcCall).toBeTruthy()
	})

	it("srcset caps at maxWidth * 2", () => {
		dispose = render(
			() => (
				<Image alt="test" loader={testLoader} maxHeight={400} maxWidth={600} src="/photo.jpg" />
			),
			container,
		)
		const img = container.querySelector("img")
		const srcset = img?.getAttribute("srcset") ?? ""
		const widths = srcset.split(", ").map((e) => Number.parseInt(e.split(" ")[1]))
		for (const w of widths) {
			expect(w).toBeLessThanOrEqual(1200)
		}
	})
})

describe("fixed mode deep", () => {
	it("density srcset uses exact width as base", () => {
		dispose = render(
			() => <Image alt="test" fixed height={32} loader={testLoader} src="/icon.png" width={32} />,
			container,
		)
		const img = container.querySelector("img")
		const srcset = img?.getAttribute("srcset") ?? ""
		expect(srcset).toContain("w=32")
		expect(srcset).toContain("w=64")
		expect(srcset).toContain("1x")
		expect(srcset).toContain("2x")
	})
})

describe("fill mode deep", () => {
	it("srcset includes all default widths (uncapped)", () => {
		dispose = render(() => <Image alt="test" fill loader={testLoader} src="/bg.jpg" />, container)
		const img = container.querySelector("img")
		const srcset = img?.getAttribute("srcset") ?? ""
		const widths = srcset.split(", ").map((e) => Number.parseInt(e.split(" ")[1]))
		expect(widths).toContain(640)
		expect(widths).toContain(1920)
		expect(widths).toContain(3840)
	})

	it("loader receives largest default width (3840)", () => {
		const spy: ImageLoader = vi.fn(() => "/out.jpg")
		dispose = render(() => <Image alt="test" fill loader={spy} src="/bg.jpg" />, container)
		const calls = vi.mocked(spy).mock.calls
		const srcCall = calls.find((c) => c[0].width === 3840)
		expect(srcCall).toBeTruthy()
	})
})

/* ── Loader precedence ── */

describe("loader precedence", () => {
	it("no loader → src passthrough, no srcset", () => {
		dispose = render(
			() => <Image alt="test" maxHeight={100} maxWidth={200} src="/photo.jpg" />,
			container,
		)
		const img = container.querySelector("img")
		expect(img?.getAttribute("src")).toBe("/photo.jpg")
		expect(img?.getAttribute("srcset")).toBeNull()
	})

	it("global loader used when no per-instance", () => {
		configureImage({ loader: testLoader })
		dispose = render(
			() => <Image alt="test" maxHeight={100} maxWidth={200} src="/photo.jpg" />,
			container,
		)
		const img = container.querySelector("img")
		expect(img?.getAttribute("src")).toContain("/_img?")
		expect(img?.getAttribute("srcset")).toBeTruthy()
	})

	it("per-instance overrides global", () => {
		configureImage({ loader: testLoader })
		const custom: ImageLoader = ({ src }) => `/custom/${src}`
		dispose = render(
			() => <Image alt="test" loader={custom} maxHeight={100} maxWidth={200} src="photo.jpg" />,
			container,
		)
		const img = container.querySelector("img")
		expect(img?.getAttribute("src")).toBe("/custom/photo.jpg")
	})

	it("resetImageConfig clears global", () => {
		configureImage({ loader: testLoader })
		resetImageConfig()
		dispose = render(
			() => <Image alt="test" maxHeight={100} maxWidth={200} src="/photo.jpg" />,
			container,
		)
		const img = container.querySelector("img")
		expect(img?.getAttribute("src")).toBe("/photo.jpg")
		expect(img?.getAttribute("srcset")).toBeNull()
	})
})

/* ── isStaticImage ── */

describe("isStaticImage", () => {
	it("returns true for StaticImageData objects", () => {
		expect(
			isStaticImage({
				blurDataURL: "data:image/webp;base64,abc",
				height: 100,
				src: "/a.webp",
				variants: { 100: "/a.webp" },
				width: 100,
			}),
		).toBe(true)
	})

	it("returns false for strings", () => {
		expect(isStaticImage("/photo.jpg")).toBe(false)
	})

	it("returns false for objects without variants", () => {
		expect(isStaticImage({ src: "/photo.jpg" } as never)).toBe(false)
	})
})

/* ── buildStaticSrcSet ── */

describe("buildStaticSrcSet", () => {
	const variants: Record<number, string> = {
		1080: "/a-1080.webp",
		1920: "/a-1920.webp",
		640: "/a-640.webp",
		828: "/a-828.webp",
	}

	it("width mode — returns all variants sorted ascending with w descriptors", () => {
		const result = buildStaticSrcSet(variants, "width", 1920)
		expect(result).toBe(
			"/a-640.webp 640w, /a-828.webp 828w, /a-1080.webp 1080w, /a-1920.webp 1920w",
		)
	})

	it("width mode — filters by maxWidth cap (maxWidth * 2)", () => {
		const result = buildStaticSrcSet(variants, "width", 1920, 500)
		/* cap = 500 * 2 = 1000 → include 640, 828, exclude 1080, 1920 */
		expect(result).toContain("640w")
		expect(result).toContain("828w")
		expect(result).not.toContain("1080w")
		expect(result).not.toContain("1920w")
	})

	it("density mode — returns 1x and 2x", () => {
		const iconVariants = { 48: "/icon-48.webp", 96: "/icon-96.webp" }
		const result = buildStaticSrcSet(iconVariants, "density", 48)
		expect(result).toBe("/icon-48.webp 1x, /icon-96.webp 2x")
	})

	it("density mode — falls back to closest variant for 2x", () => {
		const iconVariants = { 48: "/icon-48.webp", 80: "/icon-80.webp" }
		const result = buildStaticSrcSet(iconVariants, "density", 48)
		/* 2x = 96, closest ≥ 96 is 80 (fallback to largest) */
		expect(result).toContain("1x")
		expect(result).toContain("2x")
	})

	it("returns undefined for empty variants", () => {
		expect(buildStaticSrcSet({}, "width", 100)).toBeUndefined()
	})

	it("single variant in width mode produces single entry", () => {
		const result = buildStaticSrcSet({ 200: "/a-200.webp" }, "width", 200)
		expect(result).toBe("/a-200.webp 200w")
	})

	it("density mode — missing 1x variant returns undefined", () => {
		const result = buildStaticSrcSet({ 96: "/icon-96.webp" }, "density", 48)
		expect(result).toBeUndefined()
	})

	it("density mode — 1x exists but no 2x and no close variant → 1x only", () => {
		const result = buildStaticSrcSet({ 48: "/icon-48.webp" }, "density", 48)
		/* No variant >= 96, fallback picks largest (48), but 48 is 1x not 2x */
		expect(result).toContain("1x")
	})

	it("density mode — closest variant picked when exact 2x missing", () => {
		const result = buildStaticSrcSet(
			{ 100: "/a-100.webp", 48: "/a-48.webp", 64: "/a-64.webp" },
			"density",
			48,
		)
		/* 2x target = 96, closest >= 96 is 100 */
		expect(result).toBe("/a-48.webp 1x, /a-100.webp 2x")
	})

	it("width mode — all variants above cap returns undefined", () => {
		const result = buildStaticSrcSet(
			{ 1080: "/a-1080.webp", 1920: "/a-1920.webp" },
			"width",
			1920,
			200,
		)
		/* cap = 200*2 = 400, both 1080 and 1920 > 400 */
		expect(result).toBeUndefined()
	})

	it("width mode — variants with maxWidth=0 returns undefined", () => {
		const result = buildStaticSrcSet(variants, "width", 1920, 0)
		/* cap = 0*2 = 0, no variant <= 0 */
		expect(result).toBeUndefined()
	})

	it("width mode — no maxWidth includes all variants", () => {
		const result = buildStaticSrcSet(variants, "width", 1920)
		expect(result).toContain("640w")
		expect(result).toContain("828w")
		expect(result).toContain("1080w")
		expect(result).toContain("1920w")
	})
})

/* ── Static image + mode interaction edge cases ── */

describe("static image mode interactions", () => {
	const staticData = {
		blurDataURL: "data:image/webp;base64,abc",
		height: 600,
		src: "/assets/photo-800.webp",
		variants: { 400: "/assets/photo-400.webp", 800: "/assets/photo-800.webp" },
		width: 800,
	}

	it("static responsive — maxWidth smaller than smallest variant still works", () => {
		dispose = render(() => <Image alt="small" maxWidth={100} src={staticData} />, container)
		const img = container.querySelector("img")
		const style = img?.getAttribute("style") ?? ""
		expect(style).toContain("max-width: 100px")
		/* cap = 100*2 = 200, both variants (400, 800) > 200 → empty srcset */
		const srcset = img?.getAttribute("srcset")
		expect(srcset).toBeNull()
	})

	it("static responsive — no user maxWidth defaults to data.width", () => {
		dispose = render(() => <Image alt="photo" src={staticData} />, container)
		const img = container.querySelector("img")
		expect(img?.getAttribute("width")).toBe("800")
		expect(img?.getAttribute("height")).toBe("600")
	})

	it("static fixed — density srcset uses provided width, not data width", () => {
		dispose = render(
			() => <Image alt="thumb" fixed height={50} src={staticData} width={400} />,
			container,
		)
		const img = container.querySelector("img")
		const srcset = img?.getAttribute("srcset") ?? ""
		/* baseWidth = 400, 1x = variants[400], 2x = variants[800] */
		expect(srcset).toContain("/assets/photo-400.webp 1x")
		expect(srcset).toContain("/assets/photo-800.webp 2x")
	})

	it("static fill — all variants in srcset regardless of size", () => {
		dispose = render(() => <Image alt="bg" fill src={staticData} />, container)
		const img = container.querySelector("img")
		const srcset = img?.getAttribute("srcset") ?? ""
		expect(srcset).toContain("400w")
		expect(srcset).toContain("800w")
	})

	it("static with quality prop — no effect (pre-built, but no error)", () => {
		dispose = render(() => <Image alt="photo" quality={90} src={staticData} />, container)
		const img = container.querySelector("img")
		/* No crash, src from static data */
		expect(img?.getAttribute("src")).toBe("/assets/photo-800.webp")
	})
})
