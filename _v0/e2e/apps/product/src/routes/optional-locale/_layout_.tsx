import { createLayout } from "@lovrozagar/flare/layout";

export const route = createLayout("_root_/(optional-locale)").render((props) => (
	<div data-testid="optional-locale-layout">{props.children}</div>
));
