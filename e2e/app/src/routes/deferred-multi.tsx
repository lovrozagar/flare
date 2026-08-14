import { Await } from "flare/await"
import { createPage } from "flare/page"

export const route = createPage("_root_/deferred-multi")
	.loader((ctx) => {
		const fast = ctx.defer(async () => {
			await new Promise((r) => setTimeout(r, 20))
			return "fast"
		})
		const slow = ctx.defer(async () => {
			await new Promise((r) => setTimeout(r, 80))
			return "slow"
		})
		return { fast, shell: "ready", slow }
	})
	.render((props) => (
		<main data-testid="deferred-multi">
			<p data-testid="dm-shell">{props.loaderData.shell}</p>
			<Await pending={<span data-testid="fast-pending">...</span>} promise={props.loaderData.fast}>
				{(v) => <span data-testid="fast-value">{v}</span>}
			</Await>
			<Await pending={<span data-testid="slow-pending">...</span>} promise={props.loaderData.slow}>
				{(v) => <span data-testid="slow-value">{v}</span>}
			</Await>
		</main>
	))
