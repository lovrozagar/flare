import { createPage } from "flare/page"
import { createFont, FontCSS } from "flare/fonts"

const serifFont = createFont({
	category: "serif",
	fallbackMetrics: {
		ascentOverride: "111.98%",
		descentOverride: "30.50%",
		fallbackFont: "Times New Roman",
		lineGapOverride: "0.00%",
		sizeAdjust: "89.84%",
	},
	family: "Category Test Serif",
	src: "/fonts/test-serif.woff2",
	weights: "100 900",
})

const monoFont = createFont({
	category: "monospace",
	fallbackMetrics: {
		ascentOverride: "118.85%",
		descentOverride: "34.96%",
		fallbackFont: "Courier New",
		lineGapOverride: "0.00%",
		sizeAdjust: "85.82%",
	},
	family: "Category Test Mono",
	src: "/fonts/test-mono.woff2",
	weights: "100 900",
})

const sansFont = createFont({
	category: "sans-serif",
	fallbackMetrics: {
		ascentOverride: "101.93%",
		descentOverride: "25.38%",
		fallbackFont: "Arial",
		lineGapOverride: "0.00%",
		sizeAdjust: "95.04%",
	},
	family: "Category Test Sans",
	src: "/fonts/test-sans.woff2",
	weights: "100 900",
})

export const route = createPage("_root_/fonts-category-test")
	.head(() => ({ title: "Font Category Test" }))
	.render(() => (
		<main data-testid="category-test">
			<FontCSS font={serifFont} />
			<FontCSS font={monoFont} />
			<FontCSS font={sansFont} />
			<p data-testid="serif-family">{serifFont.fontFamily}</p>
			<p data-testid="mono-family">{monoFont.fontFamily}</p>
			<p data-testid="sans-family">{sansFont.fontFamily}</p>
			<div data-testid="serif-text" style={{ "font-family": serifFont.fontFamily }}>
				Serif text content for testing
			</div>
			<div data-testid="mono-text" style={{ "font-family": monoFont.fontFamily }}>
				Monospace text content for testing
			</div>
			<div data-testid="sans-text" style={{ "font-family": sansFont.fontFamily }}>
				Sans-serif text content for testing
			</div>
		</main>
	))
