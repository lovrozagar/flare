import { createLayout } from "flare/layout"

export const route = createLayout("_root_/(dc)")
	.render((props) => <div data-testid="dc-l1">{props.children}</div>)
