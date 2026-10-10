import { Await } from "@lovrozagar/flare/await";
import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/deferred-multi")
	.loader((ctx) => {
		const fast = ctx.defer<string>(async () => {
			await new Promise((r) => setTimeout(r, 100));
			return "fast-result";
		});
		const slow = ctx.defer<string>(async () => {
			await new Promise((r) => setTimeout(r, 500));
			return "slow-result";
		});
		return { fast, instant: "instant-value", shell: "ready", slow };
	})
	.head(() => ({ title: "Deferred Multi" }))
	.render((props) => (
		<main data-testid="deferred-multi">
			<div data-testid="deferred-multi-page">
				<p data-testid="dm-shell">{props.loaderData.shell}</p>
				<p data-testid="instant-data">{props.loaderData.instant}</p>
				<Await pending={<span data-testid="fast-pending">fast loading...</span>} promise={props.loaderData.fast}>
					{(v) => (
						<>
							<span data-testid="fast-value">{v}</span>
							<span data-testid="fast-resolved">{v}</span>
						</>
					)}
				</Await>
				<Await pending={<span data-testid="slow-pending">slow loading...</span>} promise={props.loaderData.slow}>
					{(v) => (
						<>
							<span data-testid="slow-value">{v}</span>
							<span data-testid="slow-resolved">{v}</span>
						</>
					)}
				</Await>
			</div>
		</main>
	));
