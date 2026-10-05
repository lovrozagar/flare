import { createRegistryFont } from "./create-registry-font.ts";
import type { Font } from "./types.ts";

/*
 * InterDisplay ships as static per-weight woff2 only (no variable font in rsms.me v4.1).
 * Weights included: 300 (light), 400 (regular), 600 (semibold) — covers all landing usages.
 * Full unicode-range: InterDisplay covers all scripts Inter covers; single range is safe
 * since these are non-subsetted files.
 */
/*
 * Capsize has no InterDisplay entry, so the fallback metrics come from InterDisplay-Regular.woff2
 * itself (@capsizecss/unpack: unitsPerEm 2048, ascent 1984, descent -494, lineGap 0, xWidthAvg 892)
 * against Arial (xWidthAvg 913), the same width-based formula populate-fonts uses. InterDisplay is
 * narrower than Inter, so it cannot reuse Inter's numbers.
 */
export const interDisplay: Font<"latin"> = createRegistryFont({
	category: "sans-serif",
	fallbackMetrics: {
		ascentOverride: "99.16%",
		descentOverride: "24.69%",
		fallbackFont: "Arial",
		lineGapOverride: "0.00%",
		sizeAdjust: "97.70%",
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
