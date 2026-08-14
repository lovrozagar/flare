import { Link } from "flare/link"
import { createPage } from "flare/page"

export const route = createPage("_root_/error-test")
	.loader((ctx) => {
		if (ctx.location.search.fail === "true") {
			throw new Error("Intentional loader error")
		}
		return { status: "ok" }
	})
	.render((props) => (
		<main data-testid="error-ok">
			<div data-testid="error-test">No error</div>
			<h1 data-testid="error-test-heading">Error Test</h1>
			<p data-testid="error-status">{props.loaderData.status}</p>
			<nav>
				<Link search={{ fail: "true" }} to="/error-test">
					Trigger Error
				</Link>
				<Link to="/">Home</Link>
			</nav>
		</main>
	))
	.errorRender((props) => (
		<div data-testid="error-boundary">
			<div data-testid="error-test-boundary">
				<h1 data-testid="error-heading">Error Caught</h1>
				<p data-testid="error-message">{props.error.message}</p>
				<p data-testid="error-test-message">{props.error.message}</p>
				<nav>
					<Link to="/">Home</Link>
				</nav>
			</div>
		</div>
	))
