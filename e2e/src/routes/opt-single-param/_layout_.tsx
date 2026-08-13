import { createLayout } from "flare/layout"

export const route = createLayout("_root_/(opt-single-param)").render((props) => (
	<div data-testid="opt-single-param-layout">{props.children}</div>
))
