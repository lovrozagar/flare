import { createLayout } from "@lovrozagar/flare/layout";

export const route = createLayout("_root_/[locale]").render((props) => (
	<div data-testid="locale-prefix-layout">{props.children}</div>
));
