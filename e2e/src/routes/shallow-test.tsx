import { createPage } from "flare/page"

export const route = createPage("_root_/shallow-test")
	.loader(() => ({
		loadedAt: Date.now(),
		random: Math.random(),
	}))
	.render((props) => (
		<div data-testid="shallow-test">
			<p data-testid="shallow-loaded-at">{props.loaderData.loadedAt}</p>
			<p data-testid="shallow-random">{props.loaderData.random}</p>
		</div>
	))
