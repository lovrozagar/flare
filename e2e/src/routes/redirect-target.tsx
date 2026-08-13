import { createPage } from "flare/page"

export const route = createPage("_root_/redirect-target").render(() => (
	<div data-testid="redirect-target">
		<h1>Redirect Target</h1>
		<p>You were redirected here.</p>
	</div>
))
