import { createPage } from "@lovrozagar/flare/page";
import { createSignal } from "solid-js";

const COLORS = ["rgb(0, 128, 0)", "rgb(200, 0, 100)", "rgb(0, 0, 200)"] as const;

export const route = createPage("_root_/styling-sx-dynamic").render(() => {
	const [colorIdx, setColorIdx] = createSignal(0);
	const color = () => COLORS[colorIdx()];

	return (
		<main data-testid="styling-sx-dynamic">
			<button data-testid="cycle-color" onClick={() => setColorIdx((i) => (i + 1) % COLORS.length)} type="button">
				Cycle Color
			</button>
			<div data-testid="sx-dynamic-box" sx={{ color: color(), padding: "16px" }}>
				Dynamic color: {color()}
			</div>
		</main>
	);
});
