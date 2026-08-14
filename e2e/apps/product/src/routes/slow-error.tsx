import { createPage } from "flare/page"

export const route = createPage("_root_/slow-error")
	.loader(async () => {
		await new Promise((r) => setTimeout(r, 800))
		throw new Error("Delayed error after 800ms")
	})
	.render(() => <div>Should not render</div>)
	.errorRender((props) => (
		<div data-testid="slow-error-boundary">
			<h1>Slow Error</h1>
			<p data-testid="slow-error-message">{props.error.message}</p>
		</div>
	))
