import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/(styling-custom-styles-shared)/styling-custom-b")
	.head(() => ({ title: "Custom B" }))
	.render(() => <div data-testid="custom-styles-b">Custom B</div>);
