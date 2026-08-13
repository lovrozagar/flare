import { createPage } from "flare/page"
import { Await } from "flare/await"

export const route = createPage("_root_/deferred-multi")
	.loader((ctx) => {
		const fast = ctx.defer<string>(async () => {
			await new Promise((r) => setTimeout(r, 100))
			return "fast-result"
		})
		const slow = ctx.defer<string>(async () => {
			await new Promise((r) => setTimeout(r, 500))
			return "slow-result"
		})
		return { fast, instant: "instant-value", slow }
	})
	.head(() => ({ title: "Deferred Multi" }))
	.render((props) => (
		<div data-testid="deferred-multi-page">
			<h1>Deferred Multi</h1>
			<p data-testid="instant-data">{props.loaderData.instant}</p>
			<Await
				promise={props.loaderData.fast}
				pending={<span data-testid="fast-pending">fast loading...</span>}
			>
				{(val) => <span data-testid="fast-resolved">{val}</span>}
			</Await>
			<Await
				promise={props.loaderData.slow}
				pending={<span data-testid="slow-pending">slow loading...</span>}
			>
				{(val) => <span data-testid="slow-resolved">{val}</span>}
			</Await>
		</div>
	))
