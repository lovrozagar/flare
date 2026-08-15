import { createRegistryFont } from "./create-registry-font.ts";
import type { Font } from "./types.ts";

/*
 * InterDisplay ships as static per-weight woff2 only (no variable font in rsms.me v4.1).
 * Weights included: 300 (light), 400 (regular), 600 (semibold) — covers all landing usages.
 * Full unicode-range: InterDisplay covers all scripts Inter covers; single range is safe
 * since these are non-subsetted files.
 */
export const interDisplay: Font<"latin"> = createRegistryFont({
	category: "sans-serif",
	fallbackMetrics: {
		ascentOverride: "101.93%",
		descentOverride: "25.38%",
		fallbackFont: "Arial",
		lineGapOverride: "0.00%",
		sizeAdjust: "95.04%",
	},
	family: "InterDisplay",
	subsetEntries: [
		{
			style: "italic",
			subset: "latin",
			unicodeRange: "U+0000-FFFF",
			url: "/fonts/inter-display/InterDisplay-LightItalic.woff2",
			weight: 300,
		},
		{
			style: "normal",
			subset: "latin",
			unicodeRange: "U+0000-FFFF",
			url: "/fonts/inter-display/InterDisplay-Light.woff2",
			weight: 300,
		},
		{
			style: "normal",
			subset: "latin",
			unicodeRange: "U+0000-FFFF",
			url: "/fonts/inter-display/InterDisplay-Regular.woff2",
			weight: 400,
		},
		{
			style: "normal",
			subset: "latin",
			unicodeRange: "U+0000-FFFF",
			url: "/fonts/inter-display/InterDisplay-SemiBold.woff2",
			weight: 600,
		},
	],
	subsets: ["latin"],
	weights: [300, 400, 600],
});
