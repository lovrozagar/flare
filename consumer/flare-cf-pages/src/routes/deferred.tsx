import { createPage } from "flare/page"
import { Await } from "flare/await"

export const route = createPage("_root_/deferred")
	.loader((ctx) => {
		const delayed = ctx.defer<{ message: string; ts: number }>(async () => {
			await new Promise((r) => setTimeout(r, 150))
			return { message: "streamed from CF Pages", ts: Date.now() }
		})
		return { delayed, shell: "ready" }
	})
	.render((props) => (
		<div>
			<h1 data-testid="deferred-heading">Deferred — CF Pages</h1>
			<p data-testid="shell-status">{props.loaderData.shell}</p>
			<Await
				pending={<p data-testid="deferred-pending">Loading...</p>}
				promise={props.loaderData.delayed}
			>
				{(val) => (
					<div>
						<p data-testid="deferred-message">{val.message}</p>
						<p data-testid="deferred-ts">{String(val.ts)}</p>
					</div>
				)}
			</Await>
			<nav>
				<a href="/">Home</a>
			</nav>
		</div>
	))
