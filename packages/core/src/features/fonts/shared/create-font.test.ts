import { expect, it } from "vitest"
import { createFont, registryFont } from "./create-font.ts"

const metrics = {
	ascentOverride: "90%",
	descentOverride: "22%",
	lineGapOverride: "0%",
	sizeAdjust: "107%",
	fallbackFont: "Arial",
}

it("local src", () => {
	const font = createFont({ family: "Brand", src: "/fonts/brand.woff2", category: "sans-serif" })
	expect(font.css()).toBe(
		'@font-face{font-family:"Brand";src:url("/fonts/brand.woff2") format("woff2");font-weight:400;font-style:normal;font-display:swap}',
	)
	expect(font.preloadLinks()).toEqual([{ href: "/fonts/brand.woff2" }])
	expect(() => createFont({ family: "Brand", src: "/fonts/../x.woff2", category: "serif" })).toThrow(
		"a font src may not contain ..",
	)
})

it("partial metrics", () => {
	const { sizeAdjust: _dropped, ...partial } = metrics
	expect(() =>
		createFont({ family: "B", src: "/b.woff2", category: "serif", fallbackMetrics: partial as typeof metrics }),
	).toThrow("fallbackMetrics needs ascentOverride, descentOverride, lineGapOverride, sizeAdjust, and fallbackFont")
})

it("stack", () => {
	expect(createFont({ family: "Hand", src: "/h.woff2", category: "handwriting" }).fontFamily).toBe('"Hand", cursive')
	expect(createFont({ family: "Show", src: "/s.woff2", category: "display" }).fontFamily).toBe('"Show", sans-serif')
	expect(createFont({ family: "Mono", src: "/m.woff2", category: "monospace" }).fontFamily).toBe('"Mono", monospace')
	const withMetrics = createFont({ family: "Body", src: "/b.woff2", category: "serif", fallbackMetrics: metrics })
	expect(withMetrics.fontFamily).toBe('"Body", "Body Fallback", serif')
})

it("weights", () => {
	const css = createFont({ family: "W", src: "/w.woff2", category: "serif", weights: [400, 700] }).css()
	const faces = css.match(/@font-face\{[^}]*\}/g) ?? []
	expect(faces).toHaveLength(2)
	expect(faces.map((face) => /font-weight:(\d+)/.exec(face)?.[1])).toEqual(["400", "700"])
	expect(faces.every((face) => face.includes("font-display:swap") && face.includes('url("/w.woff2")'))).toBe(true)
	expect(createFont({ family: "I", src: "/i.woff2", category: "serif", style: "italic" }).css()).toContain(
		"font-style:italic",
	)
})

it("no unicode range", () => {
	expect(createFont({ family: "W", src: "/w.woff2", category: "serif", weights: [400, 700] }).css()).not.toContain(
		"unicode-range",
	)
})

it("fallback face", () => {
	const css = createFont({ family: "Body", src: "/b.woff2", category: "serif", fallbackMetrics: metrics }).css()
	expect(css).toContain(
		'@font-face{font-family:"Body Fallback";src:local("Arial"),local("ArialMT"),local("Liberation Sans"),local("LiberationSans-Regular"),local("Arimo");size-adjust:107%;ascent-override:90%;descent-override:22%;line-gap-override:0%}',
	)
	// A fallback font with no metric-compatible list names itself alone.
	const other = createFont({
		family: "Body",
		src: "/b.woff2",
		category: "serif",
		fallbackMetrics: { ...metrics, fallbackFont: "Georgia" },
	}).css()
	expect(other).toContain('src:local("Georgia");')
	expect(() =>
		createFont({ family: "B", src: "/b.woff2", category: "serif", fallbackMetrics: { ...metrics, sizeAdjust: "1;x" } }),
	).toThrow('font size-adjust "1;x" is not valid')
})

it("registry", () => {
	const font = registryFont({
		family: "Inter",
		category: "sans-serif",
		files: [
			{
				subset: "latin",
				style: "normal",
				weight: "100 900",
				url: "/fonts/inter/latin.woff2",
				unicodeRange: "U+0000-00FF",
			},
			{
				subset: "latin",
				style: "italic",
				weight: "100 900",
				url: "/fonts/inter/latin-italic.woff2",
				unicodeRange: "U+0000-00FF",
			},
			{
				subset: "cyrillic",
				style: "normal",
				weight: "100 900",
				url: "/fonts/inter/cyrillic.woff2",
				unicodeRange: "U+0400-045F",
			},
		],
	})
	expect(font.subsets).toEqual(["latin", "cyrillic"])
	expect(font.css(["cyrillic"])).toBe(
		'@font-face{font-family:"Inter";src:url("/fonts/inter/cyrillic.woff2") format("woff2");font-weight:100 900;font-style:normal;font-display:swap;unicode-range:U+0400-045F}',
	)
	expect(font.css().match(/@font-face/g)).toHaveLength(3)
	expect(font.preloadLinks("latin")).toEqual([{ href: "/fonts/inter/latin.woff2" }])
	expect(font.preloadLinks()).toEqual([{ href: "/fonts/inter/latin.woff2" }])
	expect(font.fontFamily).toBe('"Inter", sans-serif')
	const withMetrics = registryFont({
		family: "Abel",
		category: "sans-serif",
		fallbackMetrics: metrics,
		files: [
			{ subset: "latin", style: "normal", weight: "400", url: "/fonts/abel/latin.woff2", unicodeRange: "U+0000-00FF" },
		],
	})
	expect(withMetrics.css()).toMatch(/^@font-face\{font-family:"Abel";.*\}@font-face\{font-family:"Abel Fallback";/)
	expect(() =>
		registryFont({ family: "X", category: "serif", fallbackMetrics: {} as typeof metrics, files: [] }),
	).toThrow("fallbackMetrics needs")
	expect(() => font.preloadLinks("nope")).toThrow("Inter has no nope subset")
	expect(() => font.css(["nope"])).toThrow("Inter has no nope subset")
})

const made = (weights: number[]) => () =>
	createFont({ family: "Brand", src: "/fonts/brand.woff2", category: "sans-serif", weights })

// A self-served font is one file: a subset name changes neither its CSS nor its preload, as the doc's
// `subsets={["latin"]}` example has it. Its weights are one face each, 1 to 1000 as CSS reads them: an empty list or
// one outside that throws (dx/features.md Fonts, BUGS.md 438).
it("self-served checks", () => {
	const font = createFont({ family: "Brand", src: "/fonts/brand.woff2", category: "sans-serif" })
	expect(font.css(["cyrillic"])).toBe(font.css())
	expect(font.preloadLinks("latin")).toEqual([{ href: "/fonts/brand.woff2" }])
	expect(font.preloadLinks()).toEqual([{ href: "/fonts/brand.woff2" }])
	expect(made([])).toThrow("weights lists no weight")
	for (const weight of [0, 1001]) expect(made([weight])).toThrow("weight")
	expect(made([1, 1000])).not.toThrow()
})
