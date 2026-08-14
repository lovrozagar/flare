import { createPage } from "flare/page"

export const route = createPage("_root_/(cached-layout)/cached-layout/isr-child")
	.cache({
		isr: { revalidate: 10 },
	})
	.loader(() => ({
		childTs: Date.now(),
		page: "isr-child",
	}))
	.render((props) => (
		<div data-testid="cached-layout-isr-child">
			<p data-testid="isr-child-page">{props.loaderData.page}</p>
			<p data-testid="isr-child-ts">{props.loaderData.childTs}</p>
		</div>
	))
