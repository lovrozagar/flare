import { createPage } from "@lovrozagar/flare/page";
import { createSignal } from "solid-js";

const VARIANTS = ["primary", "secondary", "danger"] as const;

export const route = createPage("_root_/sx-variants").render(() => {
	const [variantIdx, setVariantIdx] = createSignal(0);
	const variant = () => VARIANTS[variantIdx()];
	return (
		<main data-testid="sx-variants">
			<button data-testid="cycle-variant" type="button" onClick={() => setVariantIdx((i) => (i + 1) % VARIANTS.length)}>
				Cycle
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
				{variant()}
			</div>
		</main>
	);
});
