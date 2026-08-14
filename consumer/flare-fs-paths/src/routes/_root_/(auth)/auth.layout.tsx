import { createLayout } from "flare/layout"

export const route = createLayout("_root_/(auth)")
	.render((props) => <div data-testid="auth-layout">{props.children}</div>)
