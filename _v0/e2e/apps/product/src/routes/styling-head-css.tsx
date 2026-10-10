import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/styling-head-css")
	.head(() => ({ css: "/test-styles.css" }))
	.render(() => (
		<main data-testid="styling-head-css">
			<div class="head-styled" data-testid="head-css-box">
				Head CSS Styled
			</div>
		</main>
	));
