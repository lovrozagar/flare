import { createPage } from "flare/page"
import { styles } from "flare/styles"

export const route = createPage("_root_/styling-tw").render(() => {
	const props = styles("tw-box", {
		css: "display: flex; gap: 16px; padding: 32px; background: rgb(59,130,246); color: white;",
	})
	return (
		<main data-testid="styling-tw">
			<div {...props} data-testid="tw-box">
				TW Styled
			</div>
		</main>
	)
})
