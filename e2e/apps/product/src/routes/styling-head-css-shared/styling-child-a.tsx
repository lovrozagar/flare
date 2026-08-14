import { createPage } from "flare/page"

export const route = createPage("_root_/(styling-head-css-shared)/styling-child-a").render(() => (
	<div data-testid="child-a">Child A Content</div>
))
