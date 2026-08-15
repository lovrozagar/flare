import { createRegistryFont } from "./create-registry-font.ts";
import type { Font } from "./types.ts";

export const jost: Font<"cyrillic" | "latin" | "latin-ext"> = createRegistryFont({
	category: "sans-serif",
	fallbackMetrics: {
		ascentOverride: "134.46%",
		descentOverride: "47.12%",
		fallbackFont: "Arial",
		lineGapOverride: "0.00%",
		sizeAdjust: "79.58%",
	},
	family: "Jost",
	subsetEntries: [
		{
			style: "italic",
			subset: "cyrillic",
			unicodeRange: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116",
			url: "/fonts/jost/cyrillic-i.woff2",
			weight: "100 900",
		},
		{
			style: "italic",
			subset: "latin-ext",
			unicodeRange:
				"U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
			url: "/fonts/jost/latin-ext-i.woff2",
			weight: "100 900",
		},
		{
			style: "italic",
			subset: "latin",
			unicodeRange:
				"U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
			url: "/fonts/jost/latin-i.woff2",
			weight: "100 900",
		},
		{
			style: "normal",
			subset: "cyrillic",
			unicodeRange: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116",
			url: "/fonts/jost/cyrillic.woff2",
			weight: "100 900",
		},
		{
			style: "normal",
			subset: "latin-ext",
			unicodeRange:
				"U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
			url: "/fonts/jost/latin-ext.woff2",
			weight: "100 900",
		},
		{
			style: "normal",
			subset: "latin",
			unicodeRange:
				"U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
			url: "/fonts/jost/latin.woff2",
			weight: "100 900",
		},
	],
	subsets: ["cyrillic", "latin", "latin-ext"],
	weights: "100 900",
});
