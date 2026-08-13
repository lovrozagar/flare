import { createRegistryFont } from "./create-registry-font.ts"
import type { Font } from "./types.ts"

export const permanentMarker: Font<"latin"> = createRegistryFont({
	category: "handwriting",
	fallbackMetrics: {
		ascentOverride: "140.57%",
		descentOverride: "40.22%",
		fallbackFont: "Arial",
		lineGapOverride: "3.84%",
		sizeAdjust: "78.92%",
	},
	family: "Permanent Marker",
	subsetEntries: [
		{
			style: "normal",
			subset: "latin",
			unicodeRange:
				"U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
			url: "/fonts/permanent-marker/latin-400.woff2",
			weight: "400",
		},
	],
	subsets: ["latin"],
	weights: [400],
})
