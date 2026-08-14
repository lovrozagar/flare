import { createPage } from "flare/page"

export const route = createPage("_root_/authorize-fail")
	.authenticate()
	.authorize(({ auth }) => false)
	.loader(() => ({ message: "Should not reach" }))
	.render((props) => (
		<div data-testid="authorize-fail-content">
			<p>{props.loaderData.message}</p>
		</div>
	))
	.unauthorizedRender((props) => (
		<div data-testid="authorize-fail-unauthorized">
			<p data-testid="authorize-fail-error">{props.error.message}</p>
		</div>
	))
