import { createPage } from "flare/page"
import { createFont, FontCSS } from "flare/fonts"

/**
 * Self-hosted woff2 so the browser downloads and swaps the font,
 * enabling real CLS measurement without CSP issues.
 */
const loraReal = createFont({
	category: "serif",
	fallbackMetrics: {
		ascentOverride: "111.98%",
		descentOverride: "30.50%",
		fallbackFont: "Times New Roman",
		lineGapOverride: "0.00%",
		sizeAdjust: "89.84%",
	},
	family: "Lora CLS Test",
	src: "/fonts/lora-latin.woff2",
	weights: "400 700",
})

const loraNoFallback = createFont({
	category: "serif",
	family: "Lora No Fallback",
	src: "/fonts/lora-latin.woff2",
	weights: "400 700",
})

export const route = createPage("_root_/fonts-cls-serif-test")
	.head(() => ({ title: "CLS Serif Test" }))
	.render(() => (
		<main data-testid="cls-serif-test">
			<FontCSS font={loraReal} />
			<FontCSS font={loraNoFallback} />
			<div data-testid="serif-with-fallback" style={{ "font-family": loraReal.fontFamily }}>
				<p>
					The quick brown fox jumps over the lazy dog. This paragraph uses Lora with fallback
					metrics. When the real font loads, there should be zero layout shift because the fallback
					font (Times New Roman) has been size-adjusted to match Lora's metrics exactly.
				</p>
				<p>
					Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt
					ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation
					ullamco laboris nisi ut aliquip ex ea commodo consequat.
				</p>
			</div>
			<div
				data-testid="serif-without-fallback"
				style={{ "font-family": loraNoFallback.fontFamily }}
			>
				<p>
					The quick brown fox jumps over the lazy dog. This paragraph uses Lora WITHOUT fallback
					metrics. When the real font loads, there may be layout shift because the browser uses a
					default fallback font that doesn't match Lora's dimensions.
				</p>
				<p>
					Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt
					ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation
					ullamco laboris nisi ut aliquip ex ea commodo consequat.
				</p>
			</div>
		</main>
	))
