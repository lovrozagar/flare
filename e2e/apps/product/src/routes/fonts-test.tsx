import { createPage } from "flare/page"
import { createFont, FontCSS } from "flare/fonts"

const testFont = createFont({
	category: "sans-serif",
	fallbackMetrics: {
		ascentOverride: "90%",
		descentOverride: "22%",
		fallbackFont: "Arial",
		lineGapOverride: "0%",
		sizeAdjust: "105%",
	},
	family: "Test Font",
	src: "/fonts/test-font.woff2",
	weights: "100 900",
})

export const route = createPage("_root_/fonts-test")
	.head(() => ({
		title: "Fonts Test",
	}))
	.render(() => (
		<main data-testid="fonts-test">
			<FontCSS font={testFont} />
			<h1 style={{ "font-family": testFont.fontFamily }}>Fonts Test</h1>
			<p data-testid="font-family">{testFont.fontFamily}</p>
			<p data-testid="font-category">{testFont.category}</p>
		</main>
	))
