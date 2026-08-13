import { createPage } from "flare/page"
import { Await } from "flare/await"

export const route = createPage("_root_/prefetch-defer")
	.cache({ client: { staleTime: 60_000 } })
	.loader((ctx) => {
		const deferred = ctx.defer<string>(async () => {
			await new Promise((r) => setTimeout(r, 200))
			return `deferred-${Date.now()}`
		})
		return { deferred, shell: `shell-${Date.now()}` }
	})
	.render((props) => (
		<div data-testid="prefetch-defer-page">
			<p data-testid="shell-data">{props.loaderData.shell}</p>
			<Await
				promise={props.loaderData.deferred}
				pending={<span data-testid="deferred-pending">loading...</span>}
			>
				{(val) => <span data-testid="deferred-resolved">{val}</span>}
			</Await>
		</div>
	))
