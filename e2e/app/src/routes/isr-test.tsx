import { createPage } from "flare/page"

export const route = createPage("_root_/isr-test")
	.cache({ isr: { revalidate: 5 } })
	.loader(() => ({ renderedAt: Date.now(), source: "ssr" }))
	.render((props) => (
		<main data-testid="isr-test">
			<p data-testid="isr-source">{props.loaderData.source}</p>
			<p data-testid="isr-rendered-at">{props.loaderData.renderedAt}</p>
		</main>
	))
