import { Await } from "flare/await"
import { Link } from "flare/link"
import { createPage } from "flare/page"

export const route = createPage("_root_/deferred")
	.loader((ctx) => {
		const delayed = ctx.defer<{ message: string; ts: number }>(async () => {
			await new Promise((r) => setTimeout(r, 80))
			return { message: "streamed", ts: Date.now() }
		})
		return { delayed, shell: "ready" }
	})
	.render((props) => (
		<main data-testid="deferred">
			<h1 data-testid="deferred-heading">Deferred</h1>
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
				<Link to="/">Home</Link>
			</nav>
		</main>
	))
