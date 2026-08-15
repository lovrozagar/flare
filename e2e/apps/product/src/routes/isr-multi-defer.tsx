import { createPage } from "@lovrozagar/flare/page";
import { Await } from "@lovrozagar/flare/await";

export const route = createPage("_root_/isr-multi-defer")
	.cache({
		isr: { revalidate: 10 },
	})
	.loader((ctx) => {
		const fast = ctx.defer<string>(async () => {
			await new Promise((r) => setTimeout(r, 50));
			return "fast-result";
		});
		const slow = ctx.defer<string>(async () => {
			await new Promise((r) => setTimeout(r, 300));
			return "slow-result";
		});
		return { fast, renderedAt: Date.now(), slow };
	})
	.render((props) => (
		<div data-testid="isr-multi-defer">
			<p data-testid="isr-multi-rendered-at">{props.loaderData.renderedAt}</p>
			<Await
				promise={props.loaderData.fast}
				pending={<span data-testid="isr-multi-fast-pending">fast loading...</span>}
			>
				{(val) => <span data-testid="isr-multi-fast-resolved">{val}</span>}
			</Await>
			<Await
				promise={props.loaderData.slow}
				pending={<span data-testid="isr-multi-slow-pending">slow loading...</span>}
			>
				{(val) => <span data-testid="isr-multi-slow-resolved">{val}</span>}
			</Await>
		</div>
	));
