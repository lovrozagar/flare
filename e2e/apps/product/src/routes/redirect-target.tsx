import { createPage } from "flare/page"

export const route = createPage("_root_/redirect-target")
	.loader((ctx) => ({
		q: String(ctx.location.search.q ?? ""),
	}))
	.render((props) => (
		<main data-testid="redirect-target" style={{ display: "block", "min-height": "2rem" }}>
			<h1>Redirect Target</h1>
			<p>You were redirected here</p>
			<p data-testid="redirect-q">{props.loaderData.q}</p>
		</main>
	))
