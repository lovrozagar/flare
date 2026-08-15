import { createRegistryFont } from "./create-registry-font.ts";
import type { Font } from "./types.ts";

export const onest: Font<"cyrillic" | "cyrillic-ext" | "latin" | "latin-ext"> = createRegistryFont({
	category: "sans-serif",
	fallbackMetrics: {
		ascentOverride: "107.55%",
		descentOverride: "33.82%",
		fallbackFont: "Arial",
		lineGapOverride: "0.00%",
		sizeAdjust: "90.19%",
	},
	family: "Onest",
	subsetEntries: [
		{
			style: "normal",
			subset: "cyrillic-ext",
			unicodeRange: "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F",
			url: "/fonts/onest/cyrillic-ext.woff2",
			weight: "100 900",
		},
		{
			style: "normal",
			subset: "cyrillic",
			unicodeRange: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116",
			url: "/fonts/onest/cyrillic.woff2",
			weight: "100 900",
		},
		{
			style: "normal",
			subset: "latin-ext",
			unicodeRange:
				"U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
			url: "/fonts/onest/latin-ext.woff2",
			weight: "100 900",
		},
		{
			style: "normal",
			subset: "latin",
			unicodeRange:
				"U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
			url: "/fonts/onest/latin.woff2",
			weight: "100 900",
		},
	],
	subsets: ["cyrillic", "cyrillic-ext", "latin", "latin-ext"],
	weights: "100 900",
});
