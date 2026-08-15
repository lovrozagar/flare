import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/(dashboard)/dashboard")
	.loader(() => ({ section: "overview" }))
	.headers(({ parentHeaders }) => ({
		...parentHeaders,
		"x-dashboard-page": "overview",
	}))
	.render((props) => (
		<div data-testid="dashboard-home">
			<h1 data-testid="dash-overview-heading">Dashboard Overview</h1>
			<p data-testid="dash-section">{props.loaderData.section}</p>
		</div>
	));
