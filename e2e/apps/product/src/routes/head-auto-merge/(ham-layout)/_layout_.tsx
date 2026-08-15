import { createLayout } from "@lovrozagar/flare/layout";

export const route = createLayout("_root_/(ham-layout)")
	.head(() => ({
		description: "Layout description for merge test",
		keywords: "flare,test,merge",
	}))
	.render((props) => <div data-testid="ham-layout-wrapper">{props.children}</div>);
