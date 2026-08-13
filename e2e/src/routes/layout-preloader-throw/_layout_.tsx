import { createLayout } from "flare/layout"

export const route = createLayout("_root_/(layout-preloader-throw)")
	.preloader(() => {
		throw new Error("Layout preloader exploded")
	})
	.render((props) => <div data-testid="layout-preloader-throw-wrapper">{props.children}</div>)
	.errorRender((props) => (
		<div data-testid="layout-preloader-error-boundary">
			<p data-testid="layout-preloader-error-message">{props.error.message}</p>
		</div>
	))
