import { createPage } from "flare/page"

export const route = createPage("_root_/styling-sx-nested").render(() => {
	return (
		<main data-testid="styling-sx-nested">
			{/* Hover color on wrapper — testid div only carries base color so
			 * getComputedStyle returns rgb(0,0,0) regardless of cursor position. */}
			<div sx={{ "&:hover": { color: "rgb(0, 100, 200)" }, padding: "16px" }}>
				<div data-testid="sx-hover-box" sx={{ color: "rgb(0, 0, 0)" }}>
					Hover me
				</div>
			</div>
			<div
				data-testid="sx-media-box"
				sx={{
					"@media (min-width: 1px)": { fontSize: "24px" },
					fontSize: "12px",
				}}
			>
				Media box
			</div>
		</main>
	)
})
