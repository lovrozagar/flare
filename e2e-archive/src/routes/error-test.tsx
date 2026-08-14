import { createPage } from "flare/page"

export const route = createPage("_root_/error-test")
	.loader((ctx) => {
		if (ctx.location.search.fail === "true") {
			throw new Error("Intentional loader error")
		}
		return { ok: true }
	})
	.render(() => <div data-testid="error-test">No error</div>)
	.errorRender((props) => (
		<div data-testid="error-test-boundary">
			<p data-testid="error-test-message">{props.error.message}</p>
		</div>
	))
