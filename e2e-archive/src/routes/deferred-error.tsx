import { createPage } from "flare/page"
import { Await } from "flare/await"

export const route = createPage("_root_/deferred-error")
	.loader((ctx) => {
		const failing = ctx.defer<string>(async () => {
			await new Promise((r) => setTimeout(r, 200))
			throw new Error("Deferred failed intentionally")
		})
		return { failing, status: "ok" }
	})
	.head(() => ({ title: "Deferred Error" }))
	.render((props) => (
		<div data-testid="deferred-error-page">
			<h1>Deferred Error</h1>
			<p data-testid="status-data">{props.loaderData.status}</p>
			<Await
				error={(err, reset) => (
					<div data-testid="failing-error">
						<span data-testid="error-message">{err.message}</span>
						<button data-testid="error-reset" onClick={reset}>
							Retry
						</button>
					</div>
				)}
				pending={<span data-testid="failing-pending">loading...</span>}
				promise={props.loaderData.failing}
			>
				{(val) => <span data-testid="failing-resolved">{val}</span>}
			</Await>
		</div>
	))
