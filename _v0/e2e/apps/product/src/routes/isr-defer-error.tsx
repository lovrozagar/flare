import { createPage } from "@lovrozagar/flare/page";
import { Await } from "@lovrozagar/flare/await";

export const route = createPage("_root_/isr-defer-error")
	.cache({
		isr: { revalidate: 10 },
	})
	.loader((ctx) => {
		const bad = ctx.defer<string>(async () => {
			await new Promise((r) => setTimeout(r, 200));
			throw new Error("boom");
		});
		return { bad, renderedAt: Date.now() };
	})
	.render((props) => (
		<div data-testid="isr-defer-error">
			<p data-testid="isr-defer-error-rendered-at">{props.loaderData.renderedAt}</p>
			<Await
				promise={props.loaderData.bad}
				pending={<span data-testid="isr-defer-error-pending">loading...</span>}
				error={(err) => <span data-testid="isr-defer-error-caught">{err.message}</span>}
			>
				{(val) => <span data-testid="isr-defer-error-resolved">{val}</span>}
			</Await>
		</div>
	));
