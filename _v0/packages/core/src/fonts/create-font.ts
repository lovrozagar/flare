import { buildFontCss, buildFontFamily } from "./css.ts";
import type { CreateFontOptions, Font, FontData } from "./types.ts";

export function createFont(options: CreateFontOptions): Font<string> {
	const weights = options.weights ?? "400";

	const data: FontData = {
		category: options.category,
		fallbackMetrics: options.fallbackMetrics,
		family: options.family,
		subsetEntries: [
			{
				style: options.style ?? "normal",
				subset: "__custom__",
				unicodeRange: "U+0000-FFFF",
				url: options.src,
				weight: Array.isArray(weights) ? (weights[0] ?? 400) : weights,
			},
		],
		subsets: [],
		weights,
	};

	const fontFamily = buildFontFamily(data);

	return {
		category: options.category,
		css(_subsets?: string[]): string {
			return buildFontCss(data);
		},
		family: options.family,
		fontFamily,
		preloadLinks(_subset?: string): Array<Record<string, string>> {
			return [
				{
					as: "font",
					crossorigin: "",
					href: options.src,
					rel: "preload",
					type: "font/woff2",
				},
			];
		},
		subsets: [],
		weights,
	};
}
