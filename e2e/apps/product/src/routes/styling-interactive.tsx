import { createPage } from "@lovrozagar/flare/page";
import { styles } from "@lovrozagar/flare/styles";
import { createSignal } from "solid-js";

export const route = createPage("_root_/styling-interactive").render(() => {
	const activeProps = styles("active-box", {
		css: (s) => `
			padding: 16px;
			color: rgb(128, 128, 128);
			${s.active("true")} { color: rgb(0, 128, 0); }
		`,
		state: { active: "false" },
	});

	const variantProps = styles("variant-box", {
		css: (s) => `
			padding: 16px;
			color: rgb(0, 0, 0);
			${s.variant("a")} { color: rgb(255, 0, 0); }
			${s.variant("b")} { color: rgb(0, 0, 255); }
		`,
		state: { variant: "a" },
	});

	const [active, setActive] = createSignal(false);
	const [variant, setVariant] = createSignal<"a" | "b">("a");

	return (
		<main data-testid="styling-interactive">
			<button data-testid="toggle-active" onClick={() => setActive((prev) => !prev)} type="button">
				Toggle Active
			</button>
			<button
				data-testid="toggle-variant"
				onClick={() => setVariant((prev) => (prev === "a" ? "b" : "a"))}
				type="button"
			>
				Toggle Variant
			</button>
			<div {...activeProps} data-active={String(active())} data-testid="active-box">
				Active Box
			</div>
			<div {...variantProps} data-testid="variant-box" data-variant={variant()}>
				Variant Box
			</div>
		</main>
	);
});
