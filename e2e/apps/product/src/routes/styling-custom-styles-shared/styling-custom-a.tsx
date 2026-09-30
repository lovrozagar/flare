import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/(styling-custom-styles-shared)/styling-custom-a")
	.head(() => ({ title: "Custom A" }))
	.render(() => <div data-testid="custom-styles-a">Custom A</div>);
