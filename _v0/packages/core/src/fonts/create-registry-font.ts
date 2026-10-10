import { buildFontCss, buildFontFamily, buildPreloadLinks } from "./css.ts";
import type { FallbackMetrics, Font, FontData, SubsetEntry } from "./types.ts";

/**
 * Internal factory for generated per-font files.
 * Takes decoded registry data and returns a Font<S> with working methods.
 */
export function createRegistryFont<S extends string>(opts: {
	category: string;
	fallbackMetrics?: FallbackMetrics;
	family: string;
	subsetEntries: SubsetEntry[];
	subsets: S[];
	weights: number[] | string;
}): Font<S> {
	const data: FontData = {
		category: opts.category,
		fallbackMetrics: opts.fallbackMetrics,
		family: opts.family,
		subsetEntries: opts.subsetEntries,
		subsets: opts.subsets,
		weights: opts.weights,
	};

	const fontFamily = buildFontFamily(data);

	return {
		category: opts.category,
		css(subsets?: S[]): string {
			return buildFontCss(data, subsets);
		},
		family: opts.family,
		fontFamily,
		preloadLinks(subset?: S): Array<Record<string, string>> {
			return buildPreloadLinks(data, subset);
		},
		subsets: opts.subsets,
		weights: opts.weights,
	};
}
