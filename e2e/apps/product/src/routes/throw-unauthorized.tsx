import { unauthorized } from "flare/errors"
import { createPage } from "flare/page"

export const route = createPage("_root_/throw-unauthorized")
	.loader(() => {
		unauthorized()
	})
	.render(() => <div>Should not render</div>)
	.unauthorizedRender((props) => (
		<div data-testid="unauthorized-boundary">
			<p data-testid="unauthorized-error">{String(props.error)}</p>
			<p>Forbidden</p>
		</div>
	))
