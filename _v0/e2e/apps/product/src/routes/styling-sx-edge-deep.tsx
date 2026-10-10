import { createPage } from "@lovrozagar/flare/page";

/* Deep selector nesting and @supports/@container at-rules */
export const route = createPage("_root_/styling-sx-edge-deep").render(() => {
	return (
		<main data-testid="styling-sx-edge-deep">
			{/* 3-level nested &:hover &:focus combination.
			 * Hover color lives on a wrapper so getComputedStyle on the inner
			 * testid div always returns the base color regardless of cursor pos. */}
			<div
				sx={{
					"&:hover": {
						"&:focus-visible": { outline: "3px solid rgb(0, 120, 255)" },
						color: "rgb(0, 80, 200)",
					},
				}}
				tabindex={0}
			>
				<div data-testid="deep-nested" sx={{ color: "rgb(0, 0, 0)" }}>
					deep nested hover+focus
				</div>
			</div>

			{/* @supports */}
			<div
				data-testid="supports-grid"
				sx={{
					"@supports (display: grid)": { display: "grid" },
					display: "block",
				}}
			>
				supports grid
			</div>

			{/* negative margin */}
			<div data-testid="negative-margin" sx={{ margin: -4, padding: "8px" }}>
				negative margin
			</div>

			{/* large number of declarations — stress-test class list */}
			<div
				data-testid="many-decls"
				sx={{
					backgroundColor: "rgb(250, 250, 250)",
					borderBottomWidth: "1px",
					borderColor: "rgb(200, 200, 200)",
					borderLeftWidth: "1px",
					borderRadius: "4px",
					borderRightWidth: "1px",
					borderStyle: "solid",
					borderTopWidth: "1px",
					color: "rgb(20, 20, 20)",
					fontSize: "14px",
					fontWeight: "500",
					lineHeight: 1.5,
					padding: "8px 12px",
				}}
			>
				many declarations
			</div>
		</main>
	);
});
