import { createPage } from "@lovrozagar/flare/page";

/* Edge cases: empty sx, empty class, null/undefined branches — must not crash */
export const route = createPage("_root_/styling-sx-edge-empty").render(() => {
	const falsyFlag = false as boolean;

	return (
		<main data-testid="styling-sx-edge-empty">
			{/* empty sx object — attr removed, no crash */}
			<div data-testid="empty-sx" sx={{}}>
				empty sx
			</div>

			{/* empty class string */}
			<div class="" data-testid="empty-class">
				empty class
			</div>

			{/* falsy conditional branches in class array */}
			<div class={["base-class", falsyFlag && "never-added", null, undefined]} data-testid="falsy-branches">
				falsy branches
			</div>

			{/* sx with zero numeric values */}
			<div data-testid="zero-values" sx={{ margin: 0, padding: 0 }}>
				zero values
			</div>
		</main>
	);
});
