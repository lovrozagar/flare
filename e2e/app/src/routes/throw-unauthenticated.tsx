import { unauthenticated } from "flare/errors"
import { createPage } from "flare/page"

export const route = createPage("_root_/throw-unauthenticated")
	.loader(() => {
		unauthenticated()
	})
	.render(() => <div>Should not render</div>)
	.unauthenticatedRender(() => (
		<div data-testid="unauthenticated-boundary">
			<p>Please log in</p>
		</div>
	))
