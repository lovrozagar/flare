import { createRegistryFont } from "./create-registry-font.ts"
import type { Font } from "./types.ts"

export const notoSans: Font<
	| "cyrillic"
	| "cyrillic-ext"
	| "devanagari"
	| "greek"
	| "greek-ext"
	| "latin"
	| "latin-ext"
	| "vietnamese"
> = createRegistryFont({
	category: "sans-serif",
	fallbackMetrics: {
		ascentOverride: "126.62%",
		descentOverride: "34.70%",
		fallbackFont: "Arial",
		lineGapOverride: "0.00%",
		sizeAdjust: "84.43%",
	},
	family: "Noto Sans",
	subsetEntries: [
		{
			style: "italic",
			subset: "cyrillic-ext",
			unicodeRange: "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F",
			url: "/fonts/noto-sans/cyrillic-ext-i.woff2",
			weight: "100 900",
		},
		{
			style: "italic",
			subset: "cyrillic",
			unicodeRange: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116",
			url: "/fonts/noto-sans/cyrillic-i.woff2",
			weight: "100 900",
		},
		{
			style: "italic",
			subset: "devanagari",
			unicodeRange:
				"U+0900-097F, U+1CD0-1CF9, U+200C-200D, U+20A8, U+20B9, U+20F0, U+25CC, U+A830-A839, U+A8E0-A8FF, U+11B00-11B09",
			url: "/fonts/noto-sans/devanagari-i.woff2",
			weight: "100 900",
		},
		{
			style: "italic",
			subset: "greek-ext",
			unicodeRange: "U+1F00-1FFF",
			url: "/fonts/noto-sans/greek-ext-i.woff2",
			weight: "100 900",
		},
		{
			style: "italic",
			subset: "greek",
			unicodeRange: "U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF",
			url: "/fonts/noto-sans/greek-i.woff2",
			weight: "100 900",
		},
		{
			style: "italic",
			subset: "vietnamese",
			unicodeRange:
				"U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB",
			url: "/fonts/noto-sans/vietnamese-i.woff2",
			weight: "100 900",
		},
		{
			style: "italic",
			subset: "latin-ext",
			unicodeRange:
				"U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
			url: "/fonts/noto-sans/latin-ext-i.woff2",
			weight: "100 900",
		},
		{
			style: "italic",
			subset: "latin",
			unicodeRange:
				"U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
			url: "/fonts/noto-sans/latin-i.woff2",
			weight: "100 900",
		},
		{
			style: "normal",
			subset: "cyrillic-ext",
			unicodeRange: "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F",
			url: "/fonts/noto-sans/cyrillic-ext.woff2",
			weight: "100 900",
		},
		{
			style: "normal",
			subset: "cyrillic",
			unicodeRange: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116",
			url: "/fonts/noto-sans/cyrillic.woff2",
			weight: "100 900",
		},
		{
			style: "normal",
			subset: "devanagari",
			unicodeRange:
				"U+0900-097F, U+1CD0-1CF9, U+200C-200D, U+20A8, U+20B9, U+20F0, U+25CC, U+A830-A839, U+A8E0-A8FF, U+11B00-11B09",
			url: "/fonts/noto-sans/devanagari.woff2",
			weight: "100 900",
		},
		{
			style: "normal",
			subset: "greek-ext",
			unicodeRange: "U+1F00-1FFF",
			url: "/fonts/noto-sans/greek-ext.woff2",
			weight: "100 900",
		},
		{
			style: "normal",
			subset: "greek",
			unicodeRange: "U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF",
			url: "/fonts/noto-sans/greek.woff2",
			weight: "100 900",
		},
		{
			style: "normal",
			subset: "vietnamese",
			unicodeRange:
				"U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB",
			url: "/fonts/noto-sans/vietnamese.woff2",
			weight: "100 900",
		},
		{
			style: "normal",
			subset: "latin-ext",
			unicodeRange:
				"U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
			url: "/fonts/noto-sans/latin-ext.woff2",
			weight: "100 900",
		},
		{
			style: "normal",
			subset: "latin",
			unicodeRange:
				"U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
			url: "/fonts/noto-sans/latin.woff2",
			weight: "100 900",
		},
	],
	subsets: [
		"cyrillic",
		"cyrillic-ext",
		"devanagari",
		"greek",
		"greek-ext",
		"latin",
		"latin-ext",
		"vietnamese",
	],
	weights: "100 900",
})
