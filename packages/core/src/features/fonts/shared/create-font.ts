import { cssString, fallbackFace, fontFace, fontSrc, type FallbackMetrics } from "./css.ts"

export type { FallbackMetrics } from "./css.ts"

export type FontCategory = "serif" | "sans-serif" | "monospace" | "display" | "handwriting"

export type FontStyle = "normal" | "italic"

export type PreloadLink = { href: string }

// What `FontCSS` reads. `css` takes the subsets to emit, all of them when omitted. `preloadLinks` takes one subset,
// `latin` when omitted. A `createFont` result has one file, so both arguments leave its output alone.
export type Font = {
	family: string
	fontFamily: string
	subsets: readonly string[]
	css(subsets?: readonly string[]): string
	preloadLinks(subset?: string): PreloadLink[]
}

export type FontOptions = {
	family: string
	src: string
	category: FontCategory
	weights?: string | readonly number[]
	style?: FontStyle
	fallbackMetrics?: FallbackMetrics
}

// One stored woff2 file of a registry family (bit 14 generates these from registry.json).
export type FontFile = {
	subset: string
	style: string
	weight: string
	url: string
	unicodeRange: string
}

export type RegistryFontData = {
	family: string
	category: FontCategory
	files: readonly FontFile[]
	fallbackMetrics?: FallbackMetrics
}

const GENERIC: Record<FontCategory, string> = {
	serif: "serif",
	"sans-serif": "sans-serif",
	monospace: "monospace",
	display: "sans-serif",
	handwriting: "cursive",
}

const METRIC_FIELDS = ["ascentOverride", "descentOverride", "lineGapOverride", "sizeAdjust", "fallbackFont"] as const

function checkMetrics(metrics: FallbackMetrics | undefined): void {
	if (metrics === undefined) return
	if (METRIC_FIELDS.every((field) => typeof metrics[field] === "string")) return
	throw new Error(
		"fallbackMetrics needs ascentOverride, descentOverride, lineGapOverride, sizeAdjust, and fallbackFont",
	)
}

function stack(family: string, category: FontCategory, metrics: FallbackMetrics | undefined): string {
	const names = metrics === undefined ? [family] : [family, `${family} Fallback`]
	return [...names.map(cssString), GENERIC[category]].join(", ")
}

function withFallback(faces: string, family: string, metrics: FallbackMetrics | undefined): string {
	return metrics === undefined ? faces : faces + fallbackFace(family, metrics)
}

// A font the app serves itself. Each listed weight is one face over the same file, with no unicode-range.
export function createFont(options: FontOptions): Font {
	const src = fontSrc(options.src)
	checkMetrics(options.fallbackMetrics)
	const weights = typeof options.weights === "object" ? options.weights.map(String) : [options.weights ?? "400"]
	if (weights.length === 0) throw new Error("createFont: weights lists no weight, so no face would load")
	const style = options.style ?? "normal"
	const faces = weights.map((weight) => fontFace({ family: options.family, src, weight, style })).join("")
	const css = withFallback(faces, options.family, options.fallbackMetrics)
	return {
		family: options.family,
		fontFamily: stack(options.family, options.category, options.fallbackMetrics),
		subsets: [],
		// One self-served file, whatever it covers: a subset name changes neither its CSS nor its preload, as
		// dx/features.md's own `subsets={["latin"]}` example has it. Only a registry font checks names (BUGS.md 438).
		css: () => css,
		preloadLinks: () => [{ href: src }],
	}
}

function subsetsOf(files: readonly FontFile[]): string[] {
	return [...new Set(files.map((file) => file.subset))]
}

function known(data: RegistryFontData, subsets: readonly string[], name: string): string {
	if (!subsets.includes(name)) throw new Error(`${data.family} has no ${name} subset`)
	return name
}

// A registry family. Each stored file is one face that keeps its weight, style, and unicode-range.
export function registryFont(data: RegistryFontData): Font {
	checkMetrics(data.fallbackMetrics)
	const subsets = subsetsOf(data.files)
	const face = (file: FontFile): string =>
		fontFace({
			family: data.family,
			src: file.url,
			weight: file.weight,
			style: file.style,
			unicodeRange: file.unicodeRange,
		})
	return {
		family: data.family,
		fontFamily: stack(data.family, data.category, data.fallbackMetrics),
		subsets,
		css(wanted = subsets) {
			const names = new Set(wanted.map((name) => known(data, subsets, name)))
			const faces = data.files.filter((file) => names.has(file.subset)).map(face)
			return withFallback(faces.join(""), data.family, data.fallbackMetrics)
		},
		preloadLinks(subset) {
			if (subset === undefined && !subsets.includes("latin")) return []
			const name = known(data, subsets, subset ?? "latin")
			const urls = data.files.filter((file) => file.subset === name && file.style === "normal").map((file) => file.url)
			return [...new Set(urls)].map((href) => ({ href }))
		},
	}
}
