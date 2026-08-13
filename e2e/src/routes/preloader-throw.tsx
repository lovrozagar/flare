import { createPage } from "flare/page"

export const route = createPage("_root_/preloader-throw")
	.preloader(() => {
		throw new Error("Preloader exploded")
	})
	.loader(() => ({ reached: true }))
	.render((props) => (
		<div data-testid="preloader-render">
			<p>{String(props.loaderData.reached)}</p>
		</div>
	))
	.errorRender((props) => (
		<div data-testid="preloader-error-boundary">
			<p data-testid="preloader-error-message">{props.error.message}</p>
		</div>
	))
