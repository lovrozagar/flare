import { createLayout } from "@lovrozagar/flare/layout";

export const route = createLayout("_root_/(head-layout)")
	.head(() => ({
		description: "Layout desc",
		meta: { viewport: "width=device-width" },
	}))
	.render((props) => <div data-testid="head-layout-wrapper">{props.children}</div>);
