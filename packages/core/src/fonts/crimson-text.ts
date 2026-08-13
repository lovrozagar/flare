import { createRegistryFont } from "./create-registry-font.ts"
import type { Font } from "./types.ts"

export const crimsonText: Font<"latin" | "latin-ext" | "vietnamese"> = createRegistryFont({
	category: "serif",
	fallbackMetrics: {
		ascentOverride: "107.30%",
		descentOverride: "39.63%",
		fallbackFont: "Times New Roman",
		lineGapOverride: "0.00%",
		sizeAdjust: "88.47%",
	},
	family: "Crimson Text",
	subsetEntries: [
		{
			style: "italic",
			subset: "vietnamese",
			unicodeRange:
				"U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB",
			url: "/fonts/crimson-text/vietnamese-i-400.woff2",
			weight: "400",
		},
		{
			style: "italic",
			subset: "latin-ext",
			unicodeRange:
				"U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
			url: "/fonts/crimson-text/latin-ext-i-400.woff2",
			weight: "400",
		},
		{
			style: "italic",
			subset: "latin",
			unicodeRange:
				"U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
			url: "/fonts/crimson-text/latin-i-400.woff2",
			weight: "400",
		},
		{
			style: "italic",
			subset: "vietnamese",
			unicodeRange:
				"U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB",
			url: "/fonts/crimson-text/vietnamese-i-700.woff2",
			weight: "700",
		},
		{
			style: "italic",
			subset: "latin-ext",
			unicodeRange:
				"U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
			url: "/fonts/crimson-text/latin-ext-i-700.woff2",
			weight: "700",
		},
		{
			style: "italic",
			subset: "latin",
			unicodeRange:
				"U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
			url: "/fonts/crimson-text/latin-i-700.woff2",
			weight: "700",
		},
		{
			style: "normal",
			subset: "vietnamese",
			unicodeRange:
				"U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB",
			url: "/fonts/crimson-text/vietnamese-400.woff2",
			weight: "400",
		},
		{
			style: "normal",
			subset: "latin-ext",
			unicodeRange:
				"U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
			url: "/fonts/crimson-text/latin-ext-400.woff2",
			weight: "400",
		},
		{
			style: "normal",
			subset: "latin",
			unicodeRange:
				"U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
			url: "/fonts/crimson-text/latin-400.woff2",
			weight: "400",
		},
		{
			style: "normal",
			subset: "vietnamese",
			unicodeRange:
				"U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB",
			url: "/fonts/crimson-text/vietnamese-700.woff2",
			weight: "700",
		},
		{
			style: "normal",
			subset: "latin-ext",
			unicodeRange:
				"U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
			url: "/fonts/crimson-text/latin-ext-700.woff2",
			weight: "700",
		},
		{
			style: "normal",
			subset: "latin",
			unicodeRange:
				"U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
			url: "/fonts/crimson-text/latin-700.woff2",
			weight: "700",
		},
	],
	subsets: ["latin", "latin-ext", "vietnamese"],
	weights: [400, 700],
})
