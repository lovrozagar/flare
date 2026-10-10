import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/isr-fallback-false")
	.cache({
		isr: { revalidate: 10 },
	})
	.loader(() => ({
		renderedAt: Date.now(),
	}))
	.render((props) => (
		<div data-testid="isr-fallback-false">
			<p data-testid="isr-fallback-rendered-at">{props.loaderData.renderedAt}</p>
		</div>
	));
