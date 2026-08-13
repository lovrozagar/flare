import { createRegistryFont } from "./create-registry-font.ts"
import type { Font } from "./types.ts"

export const anticSlab: Font<"latin"> = createRegistryFont({
	category: "serif",
	fallbackMetrics: {
		ascentOverride: "97.28%",
		descentOverride: "25.87%",
		fallbackFont: "Times New Roman",
		lineGapOverride: "0.00%",
		sizeAdjust: "96.63%",
	},
	family: "Antic Slab",
	subsetEntries: [
		{
			style: "normal",
			subset: "latin",
			unicodeRange:
				"U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
			url: "/fonts/antic-slab/latin-400.woff2",
			weight: "400",
		},
	],
	subsets: ["latin"],
	weights: [400],
})
