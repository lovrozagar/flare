import { createPage } from "flare/page"

export const route = createPage("_root_/authorize-fail")
	.authenticate()
	.authorize(() => false)
	.loader(() => ({ ok: true }))
	.render(() => (
		<main data-testid="authorize-fail">
			<p>Should not render</p>
		</main>
	))
	.unauthorizedRender(() => (
		<div data-testid="authorize-fail-unauthorized">
			<p>Always rejected</p>
		</div>
	))
