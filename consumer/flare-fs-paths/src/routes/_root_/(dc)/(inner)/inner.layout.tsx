import { createLayout } from "flare/layout"

export const route = createLayout("_root_/(dc)/(inner)")
	.render((props) => <div data-testid="dc-l2">{props.children}</div>)
