import { createLayout } from "@lovrozagar/flare/layout";

export const route = createLayout("_root_/(layout-catches-child)")
	.render((props) => <div data-testid="layout-catches-wrapper">{props.children}</div>)
	.errorRender((props) => (
		<div data-testid="layout-error-boundary">
			<p data-testid="layout-error-message">{props.error.message}</p>
		</div>
	));
