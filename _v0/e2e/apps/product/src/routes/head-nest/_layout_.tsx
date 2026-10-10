import { createLayout } from "@lovrozagar/flare/layout";

export const route = createLayout("_root_/(head-nest)")
	.head(() => ({
		description: "from-layout",
		title: "Layout Title",
	}))
	.render((props) => <div data-testid="head-nest-layout">{props.children}</div>);
