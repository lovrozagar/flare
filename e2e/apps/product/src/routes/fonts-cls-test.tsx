import { createPage } from "@lovrozagar/flare/page";
import { createFont, FontCSS } from "@lovrozagar/flare/fonts";

/**
 * Uses a real Google Fonts CDN URL so the browser actually downloads
 * and swaps the font — enabling real CLS measurement.
 */
const interReal = createFont({
	category: "sans-serif",
	fallbackMetrics: {
		ascentOverride: "101.93%",
		descentOverride: "25.38%",
		fallbackFont: "Arial",
		lineGapOverride: "0.00%",
		sizeAdjust: "95.04%",
	},
	family: "Inter CLS Test",
	src: "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hjQ.woff2",
	weights: "100 900",
});

/**
 * Control: same font without fallback metrics — will have CLS.
 */
const interNoFallback = createFont({
	category: "sans-serif",
	family: "Inter No Fallback",
	src: "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hjQ.woff2",
	weights: "100 900",
});

export const route = createPage("_root_/fonts-cls-test")
	.head(() => ({ title: "CLS Test" }))
	.render(() => (
		<main data-testid="cls-test">
			<FontCSS font={interReal} />
			<FontCSS font={interNoFallback} />
			<div data-testid="with-fallback" style={{ "font-family": interReal.fontFamily }}>
				<p>
					The quick brown fox jumps over the lazy dog. This paragraph uses Inter with fallback metrics. When the real
					font loads, there should be zero layout shift because the fallback font has been size-adjusted to match
					Inter's metrics exactly.
				</p>
				<p>
					Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore
					magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo
					consequat.
				</p>
			</div>
			<div data-testid="without-fallback" style={{ "font-family": interNoFallback.fontFamily }}>
				<p>
					The quick brown fox jumps over the lazy dog. This paragraph uses Inter WITHOUT fallback metrics. When the real
					font loads, there may be layout shift because the browser uses a default fallback font that doesn't match
					Inter's dimensions.
				</p>
				<p>
					Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore
					magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo
					consequat.
				</p>
			</div>
		</main>
	));
