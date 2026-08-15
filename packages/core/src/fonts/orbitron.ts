import { createRegistryFont } from "./create-registry-font.ts";
import type { Font } from "./types.ts";

export const orbitron: Font<"latin"> = createRegistryFont({
	category: "sans-serif",
	fallbackMetrics: {
		ascentOverride: "110.25%",
		descentOverride: "26.50%",
		fallbackFont: "Arial",
		lineGapOverride: "0.00%",
		sizeAdjust: "91.70%",
	},
	family: "Orbitron",
	subsetEntries: [
		{
			style: "normal",
			subset: "latin",
			unicodeRange:
				"U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
			url: "/fonts/orbitron/latin-400.woff2",
			weight: "400",
		},
		{
			style: "normal",
			subset: "latin",
			unicodeRange:
				"U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
			url: "/fonts/orbitron/latin-700.woff2",
			weight: "700",
		},
	],
	subsets: ["latin"],
	weights: [400, 700],
});
