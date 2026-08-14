import { createPage } from "flare/page"

export const route = createPage("_root_/error-string")
	.loader(() => {
		throw "plain string error"
	})
	.render(() => <div>Should not render</div>)
	.errorRender((props) => (
		<div data-testid="error-string-boundary">
			<h1>String Error</h1>
			<p data-testid="error-string-message">{String(props.error)}</p>
			<p data-testid="error-string-type">{typeof props.error}</p>
		</div>
	))
