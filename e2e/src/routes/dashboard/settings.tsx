import { createPage } from "flare/page"

export const route = createPage("_root_/(dashboard)/dashboard/settings").render(() => (
	<div data-testid="dashboard-settings">
		<h1>Settings</h1>
		<p>Dashboard settings page.</p>
	</div>
))
