import { createRegistryFont } from "./create-registry-font.ts";
import type { Font } from "./types.ts";

export const breeSerif: Font<"latin" | "latin-ext"> = createRegistryFont({
	category: "serif",
	fallbackMetrics: {
		ascentOverride: "127.19%",
		descentOverride: "33.19%",
		fallbackFont: "Times New Roman",
		lineGapOverride: "0.00%",
		sizeAdjust: "84.68%",
	},
	family: "Bree Serif",
	subsetEntries: [
		{
			style: "normal",
			subset: "latin-ext",
			unicodeRange:
				"U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
			url: "/fonts/bree-serif/latin-ext-400.woff2",
			weight: "400",
		},
		{
			style: "normal",
			subset: "latin",
			unicodeRange:
				"U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
			url: "/fonts/bree-serif/latin-400.woff2",
			weight: "400",
		},
	],
	subsets: ["latin", "latin-ext"],
	weights: [400],
});
