import type { FontData } from "./types.ts";

function buildFontFaceBlock(entry: {
	family: string;
	style: "italic" | "normal";
	unicodeRange: string;
	url: string;
	weight: number | string;
}): string {
	return [
		"@font-face {",
		`  font-family: "${entry.family}";`,
		`  font-style: ${entry.style};`,
		`  font-weight: ${entry.weight};`,
		"  font-display: swap;",
		`  src: url(${entry.url}) format("woff2");`,
		`  unicode-range: ${entry.unicodeRange};`,
		"}",
	].join("\n");
}

/*
 * Metric-compatible clones share the fallback's advance widths and vertical metrics, so the same
 * overrides apply. Linux has no Arial / Times New Roman / Courier New, and Chromium matches
 * `local()` by font name without fontconfig aliases: without the clones the fallback face is
 * empty there and text renders in the default font, shifting on swap.
 */
const METRIC_COMPATIBLE: Record<string, string[]> = {
	Arial: ["Arial", "ArialMT", "Liberation Sans", "LiberationSans-Regular", "Arimo"],
	"Courier New": ["Courier New", "CourierNewPSMT", "Liberation Mono", "LiberationMono-Regular", "Cousine"],
	"Times New Roman": ["Times New Roman", "TimesNewRomanPSMT", "Liberation Serif", "LiberationSerif-Regular", "Tinos"],
};

function fallbackSources(fallbackFont: string): string {
	const names = METRIC_COMPATIBLE[fallbackFont] ?? [fallbackFont];
	return names.map((name) => `local("${name}")`).join(", ");
}

function buildFallbackBlock(data: FontData): string {
	if (!data.fallbackMetrics) return "";

	const m = data.fallbackMetrics;
	return [
		"@font-face {",
		`  font-family: "${data.family} Fallback";`,
		`  src: ${fallbackSources(m.fallbackFont)};`,
		`  size-adjust: ${m.sizeAdjust};`,
		`  ascent-override: ${m.ascentOverride};`,
		`  descent-override: ${m.descentOverride};`,
		`  line-gap-override: ${m.lineGapOverride};`,
		"}",
	].join("\n");
}

export function buildFontCss(data: FontData, subsets?: string[]): string {
	const entries = subsets ? data.subsetEntries.filter((e) => subsets.includes(e.subset)) : data.subsetEntries;

	const blocks = entries.map((e) =>
		buildFontFaceBlock({
			family: data.family,
			style: e.style,
			unicodeRange: e.unicodeRange,
			url: e.url,
			weight: e.weight,
		}),
	);

	const fallback = buildFallbackBlock(data);
	if (fallback) blocks.push(fallback);

	return blocks.join("\n");
}

const CATEGORY_GENERIC: Record<string, string> = {
	display: "sans-serif",
	handwriting: "cursive",
	monospace: "monospace",
	"sans-serif": "sans-serif",
	serif: "serif",
};

export function buildFontFamily(data: FontData): string {
	const generic = CATEGORY_GENERIC[data.category] ?? "sans-serif";
	if (data.fallbackMetrics) {
		return `"${data.family}", "${data.family} Fallback", ${generic}`;
	}
	return `"${data.family}", ${generic}`;
}

export function buildPreloadLinks(data: FontData, subset?: string): Array<Record<string, string>> {
	const target = subset ?? "latin";

	/* for preload, only include normal style entries (not italic) */
	const matching = data.subsetEntries.filter((e) => e.subset === target && e.style === "normal");

	return matching.map((e) => ({
		as: "font",
		crossorigin: "",
		href: e.url,
		rel: "preload",
		type: "font/woff2",
	}));
}
