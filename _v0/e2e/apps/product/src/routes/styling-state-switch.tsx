import { createPage } from "@lovrozagar/flare/page";
import { styles } from "@lovrozagar/flare/styles";
import { createSignal } from "solid-js";

const VARIANTS = ["primary", "secondary", "danger"] as const;
const SIZES = ["sm", "md", "lg"] as const;

export const route = createPage("_root_/styling-state-switch").render(() => {
	const variantProps = styles("variant-switch", {
		css: (s) => `
			padding: 16px;
			color: rgb(0, 0, 0);
			${s.variant("primary")} { color: rgb(0, 100, 200); }
			${s.variant("secondary")} { color: rgb(100, 100, 100); }
			${s.variant("danger")} { color: rgb(200, 0, 0); }
		`,
		state: { variant: "primary" },
	});

	const sizeProps = styles("size-switch", {
		css: (s) => `
			padding: 8px;
			font-size: 16px;
			${s.size("sm")} { font-size: 12px; }
			${s.size("md")} { font-size: 16px; }
			${s.size("lg")} { font-size: 24px; }
		`,
		state: { size: "md" },
	});

	const comboProps = styles("combo-switch", {
		css: (s) => `
			padding: 12px;
			color: rgb(0, 0, 0);
			font-size: 16px;
			${s.variant("primary")} { color: rgb(0, 100, 200); }
			${s.variant("secondary")} { color: rgb(100, 100, 100); }
			${s.variant("danger")} { color: rgb(200, 0, 0); }
			${s.size("sm")} { font-size: 12px; }
			${s.size("md")} { font-size: 16px; }
			${s.size("lg")} { font-size: 24px; }
		`,
		state: { size: "md", variant: "primary" },
	});

	const [variantIdx, setVariantIdx] = createSignal(0);
	const [sizeIdx, setSizeIdx] = createSignal(1);

	const variant = () => VARIANTS[variantIdx()];
	const size = () => SIZES[sizeIdx()];

	return (
		<main data-testid="styling-state-switch">
			<button data-testid="cycle-variant" onClick={() => setVariantIdx((i) => (i + 1) % VARIANTS.length)} type="button">
				Cycle Variant
			</button>
			<button data-testid="cycle-size" onClick={() => setSizeIdx((i) => (i + 1) % SIZES.length)} type="button">
				Cycle Size
			</button>

			<div {...variantProps} data-testid="variant-box" data-variant={variant()}>
				Variant: {variant()}
			</div>
			<div {...sizeProps} data-size={size()} data-testid="size-box">
				Size: {size()}
			</div>
			<div {...comboProps} data-size={size()} data-testid="combo-box" data-variant={variant()}>
				Combo: {variant()} / {size()}
			</div>
		</main>
	);
});
