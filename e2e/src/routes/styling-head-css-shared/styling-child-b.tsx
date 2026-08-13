import { createPage } from "flare/page"

export const route = createPage("_root_/(styling-head-css-shared)/styling-child-b")
	.head(() => ({ css: "/child-b-only.css" }))
	.render(() => (
		<div class="child-b-el" data-testid="child-b">
			Child B Content
		</div>
	))
