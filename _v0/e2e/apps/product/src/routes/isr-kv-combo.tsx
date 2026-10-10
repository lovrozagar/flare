import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/isr-kv-combo")
	.cache({
		isr: { revalidate: 10 },
	})
	.loader(() => ({
		renderedAt: Date.now(),
		source: "ssr",
	}))
	.render((props) => (
		<div data-testid="isr-kv-combo">
			<p data-testid="isr-kv-source">{props.loaderData.source}</p>
			<p data-testid="isr-kv-rendered-at">{props.loaderData.renderedAt}</p>
		</div>
	));
