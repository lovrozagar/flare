import { createRegistryFont } from "./create-registry-font.ts"
import type { Font } from "./types.ts"

export const firaSansCondensed: Font<
	"cyrillic" | "cyrillic-ext" | "greek" | "greek-ext" | "latin" | "latin-ext" | "vietnamese"
> = createRegistryFont({
	category: "sans-serif",
	fallbackMetrics: {
		ascentOverride: "97.57%",
		descentOverride: "27.65%",
		fallbackFont: "Arial",
		lineGapOverride: "0.00%",
		sizeAdjust: "95.83%",
	},
	family: "Fira Sans Condensed",
	subsetEntries: [
		{
			style: "italic",
			subset: "cyrillic-ext",
			unicodeRange: "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F",
			url: "/fonts/fira-sans-condensed/cyrillic-ext-i-400.woff2",
			weight: "400",
		},
		{
			style: "italic",
			subset: "cyrillic",
			unicodeRange: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116",
			url: "/fonts/fira-sans-condensed/cyrillic-i-400.woff2",
			weight: "400",
		},
		{
			style: "italic",
			subset: "greek-ext",
			unicodeRange: "U+1F00-1FFF",
			url: "/fonts/fira-sans-condensed/greek-ext-i-400.woff2",
			weight: "400",
		},
		{
			style: "italic",
			subset: "greek",
			unicodeRange: "U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF",
			url: "/fonts/fira-sans-condensed/greek-i-400.woff2",
			weight: "400",
		},
		{
			style: "italic",
			subset: "vietnamese",
			unicodeRange:
				"U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB",
			url: "/fonts/fira-sans-condensed/vietnamese-i-400.woff2",
			weight: "400",
		},
		{
			style: "italic",
			subset: "latin-ext",
			unicodeRange:
				"U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
			url: "/fonts/fira-sans-condensed/latin-ext-i-400.woff2",
			weight: "400",
		},
		{
			style: "italic",
			subset: "latin",
			unicodeRange:
				"U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
			url: "/fonts/fira-sans-condensed/latin-i-400.woff2",
			weight: "400",
		},
		{
			style: "italic",
			subset: "cyrillic-ext",
			unicodeRange: "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F",
			url: "/fonts/fira-sans-condensed/cyrillic-ext-i-700.woff2",
			weight: "700",
		},
		{
			style: "italic",
			subset: "cyrillic",
			unicodeRange: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116",
			url: "/fonts/fira-sans-condensed/cyrillic-i-700.woff2",
			weight: "700",
		},
		{
			style: "italic",
			subset: "greek-ext",
			unicodeRange: "U+1F00-1FFF",
			url: "/fonts/fira-sans-condensed/greek-ext-i-700.woff2",
			weight: "700",
		},
		{
			style: "italic",
			subset: "greek",
			unicodeRange: "U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF",
			url: "/fonts/fira-sans-condensed/greek-i-700.woff2",
			weight: "700",
		},
		{
			style: "italic",
			subset: "vietnamese",
			unicodeRange:
				"U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB",
			url: "/fonts/fira-sans-condensed/vietnamese-i-700.woff2",
			weight: "700",
		},
		{
			style: "italic",
			subset: "latin-ext",
			unicodeRange:
				"U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
			url: "/fonts/fira-sans-condensed/latin-ext-i-700.woff2",
			weight: "700",
		},
		{
			style: "italic",
			subset: "latin",
			unicodeRange:
				"U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
			url: "/fonts/fira-sans-condensed/latin-i-700.woff2",
			weight: "700",
		},
		{
			style: "normal",
			subset: "cyrillic-ext",
			unicodeRange: "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F",
			url: "/fonts/fira-sans-condensed/cyrillic-ext-400.woff2",
			weight: "400",
		},
		{
			style: "normal",
			subset: "cyrillic",
			unicodeRange: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116",
			url: "/fonts/fira-sans-condensed/cyrillic-400.woff2",
			weight: "400",
		},
		{
			style: "normal",
			subset: "greek-ext",
			unicodeRange: "U+1F00-1FFF",
			url: "/fonts/fira-sans-condensed/greek-ext-400.woff2",
			weight: "400",
		},
		{
			style: "normal",
			subset: "greek",
			unicodeRange: "U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF",
			url: "/fonts/fira-sans-condensed/greek-400.woff2",
			weight: "400",
		},
		{
			style: "normal",
			subset: "vietnamese",
			unicodeRange:
				"U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB",
			url: "/fonts/fira-sans-condensed/vietnamese-400.woff2",
			weight: "400",
		},
		{
			style: "normal",
			subset: "latin-ext",
			unicodeRange:
				"U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
			url: "/fonts/fira-sans-condensed/latin-ext-400.woff2",
			weight: "400",
		},
		{
			style: "normal",
			subset: "latin",
			unicodeRange:
				"U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
			url: "/fonts/fira-sans-condensed/latin-400.woff2",
			weight: "400",
		},
		{
			style: "normal",
			subset: "cyrillic-ext",
			unicodeRange: "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F",
			url: "/fonts/fira-sans-condensed/cyrillic-ext-700.woff2",
			weight: "700",
		},
		{
			style: "normal",
			subset: "cyrillic",
			unicodeRange: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116",
			url: "/fonts/fira-sans-condensed/cyrillic-700.woff2",
			weight: "700",
		},
		{
			style: "normal",
			subset: "greek-ext",
			unicodeRange: "U+1F00-1FFF",
			url: "/fonts/fira-sans-condensed/greek-ext-700.woff2",
			weight: "700",
		},
		{
			style: "normal",
			subset: "greek",
			unicodeRange: "U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF",
			url: "/fonts/fira-sans-condensed/greek-700.woff2",
			weight: "700",
		},
		{
			style: "normal",
			subset: "vietnamese",
			unicodeRange:
				"U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB",
			url: "/fonts/fira-sans-condensed/vietnamese-700.woff2",
			weight: "700",
		},
		{
			style: "normal",
			subset: "latin-ext",
			unicodeRange:
				"U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
			url: "/fonts/fira-sans-condensed/latin-ext-700.woff2",
			weight: "700",
		},
		{
			style: "normal",
			subset: "latin",
			unicodeRange:
				"U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
			url: "/fonts/fira-sans-condensed/latin-700.woff2",
			weight: "700",
		},
	],
	subsets: ["cyrillic", "cyrillic-ext", "greek", "greek-ext", "latin", "latin-ext", "vietnamese"],
	weights: [400, 700],
})
