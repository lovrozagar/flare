export interface FallbackMetrics {
	ascentOverride: string;
	descentOverride: string;
	fallbackFont: string;
	lineGapOverride: string;
	sizeAdjust: string;
}

export interface SubsetEntry {
	style: "italic" | "normal";
	subset: string;
	unicodeRange: string;
	url: string;
	weight: number | string;
}

export interface FontData {
	category: string;
	family: string;
	fallbackMetrics?: FallbackMetrics;
	subsetEntries: SubsetEntry[];
	subsets: string[];
	weights: number[] | string;
}

export interface Font<S extends string = string> {
	category: string;
	css(subsets?: S[]): string;
	family: string;
	fontFamily: string;
	preloadLinks(subset?: S): Array<Record<string, string>>;
	subsets: S[];
	weights: number[] | string;
}

export interface CreateFontOptions {
	category: string;
	fallbackMetrics?: FallbackMetrics;
	family: string;
	src: string;
	style?: "italic" | "normal";
	weights?: number[] | string;
}
