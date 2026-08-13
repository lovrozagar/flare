import { createPage } from "flare/page"
import { createSignal } from "solid-js"

const VARIANTS = ["primary", "secondary", "danger"] as const
type Variant = (typeof VARIANTS)[number]

export const route = createPage("_root_/styling-sx-variants").render(() => {
	const [variantIdx, setVariantIdx] = createSignal(0)
	const variant = (): Variant => VARIANTS[variantIdx()]

	return (
		<main data-testid="styling-sx-variants">
			<button
				data-testid="cycle-variant"
				onClick={() => setVariantIdx((i) => (i + 1) % VARIANTS.length)}
				type="button"
			>
				Cycle Variant
			</button>
			<div
				data-testid="sx-variants-box"
				data-variant={variant()}
				sx={{
					color: "rgb(0, 0, 0)",
					padding: "16px",
					variants: {
						variant: {
							danger: { color: "rgb(200, 0, 0)" },
							primary: { color: "rgb(0, 100, 200)" },
							secondary: { color: "rgb(100, 100, 100)" },
						},
					},
				}}
			>
				Variant: {variant()}
			</div>
		</main>
	)
})
