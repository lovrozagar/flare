import { createLayout } from "flare/layout"

export const route = createLayout("_root_/(dc)/(inner)/(leaf)")
	.render((props) => <div data-testid="dc-l3">{props.children}</div>)
