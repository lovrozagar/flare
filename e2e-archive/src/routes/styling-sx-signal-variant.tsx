import { createPage } from "flare/page"
import { createSignal } from "solid-js"

/* Signal toggles data-variant attr — variant classes already emitted statically */
const VARIANTS = ["info", "success", "error"] as const
type Variant = (typeof VARIANTS)[number]

export const route = createPage("_root_/styling-sx-signal-variant").render(() => {
	const [idx, setIdx] = createSignal(0)
	const variant = (): Variant => VARIANTS[idx()]

	return (
		<main data-testid="styling-sx-signal-variant">
			<button
				data-testid="cycle-variant"
				onClick={() => setIdx((i) => (i + 1) % VARIANTS.length)}
				type="button"
			>
				Cycle Variant
			</button>
			<div
				data-testid="signal-variant-box"
				data-variant={variant()}
				sx={{
					padding: "12px",
					variants: {
						variant: {
							error: { backgroundColor: "rgb(255, 220, 220)", color: "rgb(180, 0, 0)" },
							info: { backgroundColor: "rgb(220, 235, 255)", color: "rgb(0, 50, 180)" },
							success: { backgroundColor: "rgb(220, 255, 220)", color: "rgb(0, 130, 0)" },
						},
					},
				}}
			>
				Variant: {variant()}
			</div>
		</main>
	)
})
