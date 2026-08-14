import { createPage } from "flare/page"

export const route = createPage("_root_/(dashboard)/dashboard/settings")
	.loader(() => {
		return { section: "settings", ts: Date.now() }
	})
	.render((props) => (
		<div>
			<h1 data-testid="dash-settings-heading">Dashboard Settings</h1>
			<p data-testid="dash-settings-section">{props.loaderData.section}</p>
		</div>
	))
