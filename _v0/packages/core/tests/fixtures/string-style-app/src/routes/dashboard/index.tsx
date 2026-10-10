import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/(dashboard)/dashboard")
	.loader(() => {
		return { section: "overview", ts: Date.now() };
	})
	.headers(({ parentHeaders }) => ({
		...parentHeaders,
		"x-dashboard-page": "overview",
	}))
	.render((props) => (
		<div>
			<h1 data-testid="dash-overview-heading">Dashboard Overview</h1>
			<p data-testid="dash-section">{props.loaderData.section}</p>
			<p data-testid="dash-ts">{String(props.loaderData.ts)}</p>
		</div>
	));
