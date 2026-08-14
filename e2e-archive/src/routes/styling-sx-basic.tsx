import { createPage } from "flare/page"

export const route = createPage("_root_/styling-sx-basic").render(() => {
	return (
		<main data-testid="styling-sx-basic">
			<div
				data-testid="sx-basic-box"
				sx={{ color: "rgb(0, 0, 255)", fontSize: "24px", fontWeight: "700" }}
			>
				Basic sx box
			</div>
			<span data-testid="sx-basic-text" sx={{ color: "rgb(100, 100, 100)", fontSize: "14px" }}>
				Small text
			</span>
		</main>
	)
})
