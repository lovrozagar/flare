import { createPage } from "@lovrozagar/flare/page";
import { Await } from "@lovrozagar/flare/await";

export const route = createPage("_root_/isr-defer")
	.cache({
		isr: { revalidate: 10 },
	})
	.loader((ctx) => {
		const delayed = ctx.defer<{ comment: string }>(async () => {
			await new Promise((r) => setTimeout(r, 200));
			return { comment: "deferred-comment" };
		});
		return { delayed, renderedAt: Date.now(), title: "ISR Defer" };
	})
	.render((props) => (
		<div data-testid="isr-defer">
			<h1 data-testid="isr-defer-title">{props.loaderData.title}</h1>
			<p data-testid="isr-defer-rendered-at">{props.loaderData.renderedAt}</p>
			<Await pending={<span data-testid="isr-defer-pending">Loading...</span>} promise={props.loaderData.delayed}>
				{(val) => <span data-testid="isr-defer-resolved">{val.comment}</span>}
			</Await>
		</div>
	));
