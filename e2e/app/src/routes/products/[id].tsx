import { createPage } from "flare/page"

export const route = createPage("_root_/(products)/products/[id]")
	.intercept({ from: ["/products"], render: "modal" })
	.loader((ctx) => ({
		id: ctx.location.params.id,
		name: `Product ${ctx.location.params.id}`,
	}))
	.render((props) => (
		<div data-testid="product-detail">
			<h2 data-testid="product-name">{props.loaderData.name}</h2>
			<p data-testid="product-id">{props.loaderData.id}</p>
		</div>
	))
