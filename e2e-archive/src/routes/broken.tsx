import { createPage } from "flare/page"

export const route = createPage("_root_/broken")
	.loader(() => {
		throw new Error("Intentional loader error")
	})
	.render(() => <div>Should not render</div>)
	.errorRender((props) => (
		<div data-testid="error-boundary">
			<h1>Error</h1>
			<p data-testid="error-message">{props.error.message}</p>
		</div>
	))
