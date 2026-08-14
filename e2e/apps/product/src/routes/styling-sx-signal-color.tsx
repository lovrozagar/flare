import { createPage } from "flare/page"
import { createSignal } from "solid-js"

/* Signal-bound color — flows through CSS custom property (--_N), no re-register on update */
const COLORS = ["rgb(200, 0, 0)", "rgb(0, 200, 0)", "rgb(0, 0, 200)"] as const

export const route = createPage("_root_/styling-sx-signal-color").render(() => {
	const [idx, setIdx] = createSignal(0)
	const color = () => COLORS[idx()]

	return (
		<main data-testid="styling-sx-signal-color">
			<button
				data-testid="cycle-color"
				onClick={() => setIdx((i) => (i + 1) % COLORS.length)}
				type="button"
			>
				Cycle
			</button>
			<div
				data-testid="signal-color-box"
				sx={{ color: color(), fontSize: "18px", padding: "12px" }}
			>
				Color: {color()}
			</div>
			{/* verify the CSS var is set inline (not a new style tag per update) */}
			<p data-testid="signal-color-value">{color()}</p>
		</main>
	)
})
