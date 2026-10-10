import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/(ham-layout)/head-auto-merge/auto-merged")
	.head(() => ({
		title: "Auto Merged Page",
	}))
	.render(() => <div data-testid="ham-auto-merged">Auto-merge active</div>);
