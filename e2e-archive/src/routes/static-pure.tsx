import { createPage } from "flare/page"

export const route = createPage("_root_/static-pure")
	.cache({
		ssg: true,
	})
	.loader(() => ({
		builtAt: Date.now(),
		source: "ssr",
	}))
	.render((props) => (
		<div data-testid="static-pure">
			<p data-testid="static-pure-source">{props.loaderData.source}</p>
			<p data-testid="static-pure-built-at">{props.loaderData.builtAt}</p>
		</div>
	))
