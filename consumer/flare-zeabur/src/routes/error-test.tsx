import { createPage } from "flare/page"

export const route = createPage("_root_/error-test")
	.loader((ctx) => {
		const fail = ctx.location.search.fail
		if (fail === "true") {
			throw new Error("Intentional loader error")
		}
		return { status: "ok", timestamp: Date.now() }
	})
	.render((props) => (
		<div>
			<h1 data-testid="error-test-heading">Error Test — Zeabur</h1>
			<p data-testid="error-status">{props.loaderData.status}</p>
			<p data-testid="error-ts">{String(props.loaderData.timestamp)}</p>
			<nav>
				<a href="/error-test?fail=true">Trigger Error</a>
				<a href="/">Home</a>
			</nav>
		</div>
	))
	.errorRender((props) => (
		<div data-testid="error-boundary">
			<h1 data-testid="error-heading">Error Caught</h1>
			<p data-testid="error-message">{props.error.message}</p>
			<nav>
				<a href="/">Home</a>
			</nav>
		</div>
	))
