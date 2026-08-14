import { createPage } from "flare/page"

export const route = createPage("_root_/(layout-preloader-throw)/layout-preloader-throw/")
	.loader(() => ({ child: true }))
	.render(() => (
		<div data-testid="layout-preloader-child">
			<p>Child page — should not render when layout preloader throws</p>
		</div>
	))
