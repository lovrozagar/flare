import { Await } from "@lovrozagar/flare/await";
import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/prefetch-defer")
	.cache({ client: { staleTime: 60_000 } })
	.loader((ctx) => {
		const deferred = ctx.defer<string>(async () => {
			await new Promise((r) => setTimeout(r, 80));
			return `deferred-${Date.now()}`;
		});
		return { deferred, shell: `shell-${Date.now()}` };
	})
	.render((props) => (
		<main data-testid="prefetch-defer-page">
			<p data-testid="shell-data">{props.loaderData.shell}</p>
			<Await pending={<span data-testid="deferred-pending">loading...</span>} promise={props.loaderData.deferred}>
				{(val) => <span data-testid="deferred-resolved">{val}</span>}
			</Await>
		</main>
	));
