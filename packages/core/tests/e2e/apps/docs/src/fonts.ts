import { createFont } from "@lovrozagar/flare"
import inter from "@lovrozagar/flare/fonts/inter"

// Inter is a registry font: the build emits its files from assets/fonts (vite.config.ts). The code font is the
// app's own file, with fallback metrics so the swap does not shift the layout.
export { inter }

export const mono = createFont({
	family: "Docs Mono",
	src: "/fonts/mono.woff2",
	category: "monospace",
	weights: [400, 600],
	fallbackMetrics: {
		ascentOverride: "92%",
		descentOverride: "24%",
		lineGapOverride: "0%",
		sizeAdjust: "100%",
		fallbackFont: "Courier New",
	},
})
