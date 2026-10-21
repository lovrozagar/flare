// `@font-face` text for a style tag. A family, a url, and a local() name are CSS strings with every character outside
// a plain set hex-escaped, so the text holds no `<`, `>`, `&`, quote, backslash, or parenthesis. The other fields are
// validated tokens. The text is safe inside `<style>` and inside the CSS string it sits in.
export type FontFace = {
	family: string
	src: string
	weight: string
	style: string
	unicodeRange?: string
}

export type FallbackMetrics = {
	ascentOverride: string
	descentOverride: string
	lineGapOverride: string
	sizeAdjust: string
	fallbackFont: string
}

const PLAIN = /[A-Za-z0-9 ._/:,+-]/
const WEIGHT = /^\d{1,4}( \d{1,4})?$/

// One weight, or a range, each from 1 to 1000 as CSS reads `font-weight`: a browser reads any other as `normal`
// (BUGS.md 438).
function weightOk(weight: string): boolean {
	return WEIGHT.test(weight) && weight.split(" ").every((part) => Number(part) >= 1 && Number(part) <= 1000)
}
const STYLES = ["normal", "italic", "oblique"]
const RANGE = /^U\+[0-9A-F?]{1,6}(-[0-9A-F]{1,6})?(, ?U\+[0-9A-F?]{1,6}(-[0-9A-F]{1,6})?)*$/i
const PERCENT = /^\d{1,4}(\.\d{1,4})?%$/
// A browser resolves an encoded dot segment as `..` too.
const DOTS = /(\.|%2e){2}/i

// The names that share each common fallback's metrics, so the fallback face finds one on every OS.
const COMPATIBLE: Record<string, readonly string[]> = {
	Arial: ["Arial", "ArialMT", "Liberation Sans", "LiberationSans-Regular", "Arimo"],
	"Courier New": ["Courier New", "CourierNewPSMT", "Liberation Mono", "LiberationMono-Regular", "Cousine"],
	"Times New Roman": ["Times New Roman", "TimesNewRomanPSMT", "Liberation Serif", "LiberationSerif-Regular", "Tinos"],
}

export function cssString(value: string): string {
	let out = ""
	// A for-of step is one whole code point, so codePointAt(0) is always a number.
	for (const char of value) {
		out += PLAIN.test(char) ? char : `\\${Number(char.codePointAt(0)).toString(16).toUpperCase()} `
	}
	return `"${out}"`
}

function checked(value: string, valid: boolean, field: string): string {
	if (!valid) throw new Error(`font ${field} ${JSON.stringify(value)} is not valid`)
	return value
}

function percent(value: string, field: string): string {
	return checked(value, PERCENT.test(value), field)
}

export function fontSrc(src: string): string {
	if (DOTS.test(src)) throw new Error("a font src may not contain ..")
	return src
}

export function fontFace(face: FontFace): string {
	const weight = checked(face.weight, weightOk(face.weight), "weight")
	const style = checked(face.style, STYLES.includes(face.style), "style")
	const rule =
		`@font-face{font-family:${cssString(face.family)};src:url(${cssString(fontSrc(face.src))}) format("woff2");` +
		`font-weight:${weight};font-style:${style};font-display:swap`
	if (face.unicodeRange === undefined) return `${rule}}`
	return `${rule};unicode-range:${checked(face.unicodeRange, RANGE.test(face.unicodeRange), "unicode-range")}}`
}

// The metric-adjusted local face that stands in until the web font loads.
export function fallbackFace(family: string, metrics: FallbackMetrics): string {
	const names = COMPATIBLE[metrics.fallbackFont] ?? [metrics.fallbackFont]
	const src = names.map((name) => `local(${cssString(name)})`).join(",")
	return (
		`@font-face{font-family:${cssString(`${family} Fallback`)};src:${src};` +
		`size-adjust:${percent(metrics.sizeAdjust, "size-adjust")};` +
		`ascent-override:${percent(metrics.ascentOverride, "ascent-override")};` +
		`descent-override:${percent(metrics.descentOverride, "descent-override")};` +
		`line-gap-override:${percent(metrics.lineGapOverride, "line-gap-override")}}`
	)
}
