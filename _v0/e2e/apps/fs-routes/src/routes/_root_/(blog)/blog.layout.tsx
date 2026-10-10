import { createLayout } from "@lovrozagar/flare/layout";

export const route = createLayout("_root_/(blog)").render((props) => (
	<div data-testid="blog-layout">{props.children}</div>
));
