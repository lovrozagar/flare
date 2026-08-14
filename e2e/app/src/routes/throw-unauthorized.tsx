import { unauthorized } from "flare/errors"
import { createPage } from "flare/page"

export const route = createPage("_root_/throw-unauthorized")
	.loader(() => {
		unauthorized()
	})
	.render(() => <div>Should not render</div>)
	.unauthorizedRender(() => (
		<div data-testid="unauthorized-boundary">
			<p>Forbidden</p>
		</div>
	))
