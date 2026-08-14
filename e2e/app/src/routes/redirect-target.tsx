import { createPage } from "flare/page"

export const route = createPage("_root_/redirect-target")
	.loader((ctx) => ({
		q: String(ctx.location.search.q ?? ""),
	}))
	.render((props) => (
		<main data-testid="redirect-target">
			<p data-testid="redirect-q">{props.loaderData.q}</p>
		</main>
	))
