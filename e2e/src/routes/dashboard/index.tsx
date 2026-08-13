import { createPage } from "flare/page"

export const route = createPage("_root_/(dashboard)/dashboard/").render(() => (
	<div data-testid="dashboard-home">
		<h1>Dashboard Home</h1>
		<p>Welcome to the dashboard.</p>
	</div>
))
