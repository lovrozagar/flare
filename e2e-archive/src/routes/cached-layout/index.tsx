import { createPage } from "flare/page"

export const route = createPage("_root_/(cached-layout)/cached-layout/")
	.loader(() => ({
		childTs: Date.now(),
		page: "cached-layout-index",
	}))
	.render((props) => (
		<div data-testid="cached-layout-index">
			<p data-testid="cached-layout-index-page">{props.loaderData.page}</p>
			<p data-testid="cached-layout-index-ts">{props.loaderData.childTs}</p>
		</div>
	))
