import { createLayout } from "@lovrozagar/flare/layout";

export const route = createLayout("_root_/(i18n-test)").render((props) => (
	<div data-testid="i18n-test-layout">{props.children}</div>
));
