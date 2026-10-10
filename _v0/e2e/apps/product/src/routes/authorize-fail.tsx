import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/authorize-fail")
	.authenticate()
	.authorize(() => false)
	.loader(() => ({ ok: true }))
	.render(() => (
		<main data-testid="authorize-fail">
			<p>Should not render</p>
		</main>
	))
	.unauthorizedRender((props) => (
		<div data-testid="authorize-fail-unauthorized">
			<p data-testid="authorize-fail-error">{props.error.message}</p>
			<p>Always rejected</p>
		</div>
	));
