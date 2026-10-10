import { createPage } from "@lovrozagar/flare/page";
import { createFont, FontCSS } from "@lovrozagar/flare/fonts";

/**
 * Self-hosted woff2 so the browser downloads and swaps the font,
 * enabling real CLS measurement without CSP issues.
 */
const firaCodeReal = createFont({
	category: "monospace",
	fallbackMetrics: {
		ascentOverride: "114.66%",
		descentOverride: "37.29%",
		fallbackFont: "Courier New",
		lineGapOverride: "0.00%",
		sizeAdjust: "86.34%",
	},
	family: "Fira Code CLS Test",
	src: "/fonts/firacode-latin.woff2",
	weights: "300 700",
});

const firaCodeNoFallback = createFont({
	category: "monospace",
	family: "Fira Code No Fallback",
	src: "/fonts/firacode-latin.woff2",
	weights: "300 700",
});

export const route = createPage("_root_/fonts-cls-mono-test")
	.head(() => ({ title: "CLS Mono Test" }))
	.render(() => (
		<main data-testid="cls-mono-test">
			<FontCSS font={firaCodeReal} />
			<FontCSS font={firaCodeNoFallback} />
			<div data-testid="mono-with-fallback" style={{ "font-family": firaCodeReal.fontFamily }}>
				<p>
					The quick brown fox jumps over the lazy dog. This paragraph uses Fira Code with fallback metrics. When the
					real font loads, there should be zero layout shift because the fallback font (Courier New) has been
					size-adjusted to match Fira Code's metrics exactly.
				</p>
				<p>
					Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore
					magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo
					consequat.
				</p>
			</div>
			<div data-testid="mono-without-fallback" style={{ "font-family": firaCodeNoFallback.fontFamily }}>
				<p>
					The quick brown fox jumps over the lazy dog. This paragraph uses Fira Code WITHOUT fallback metrics. When the
					real font loads, there may be layout shift because the browser uses a default fallback font that doesn't match
					Fira Code's dimensions.
				</p>
				<p>
					Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore
					magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo
					consequat.
				</p>
			</div>
		</main>
	));
