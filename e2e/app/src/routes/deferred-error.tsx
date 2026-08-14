import { Await } from "flare/await"
import { createPage } from "flare/page"

export const route = createPage("_root_/deferred-error")
	.loader((ctx) => {
		const boom = ctx.defer(async () => {
			await new Promise((r) => setTimeout(r, 20))
			throw new Error("deferred failed")
		})
		return { boom }
	})
	.render((props) => (
		<main data-testid="deferred-error">
			<Await
				error={(err) => <span data-testid="deferred-error-msg">{err.message}</span>}
				pending={<span>loading</span>}
				promise={props.loaderData.boom}
			>
				{() => <span>ok</span>}
			</Await>
		</main>
	))
