import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/(dashboard)/dashboard/settings")
	.loader(() => ({ section: "settings" }))
	.render((props) => (
		<div data-testid="dashboard-settings">
			<h1 data-testid="dash-settings-heading">Dashboard Settings</h1>
			<p data-testid="dash-settings-section">{props.loaderData.section}</p>
		</div>
	));
