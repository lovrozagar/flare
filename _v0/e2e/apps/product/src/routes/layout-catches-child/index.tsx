import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/(layout-catches-child)/layout-catches-child/")
	.loader(() => ({ safe: true }))
	.render(() => <div data-testid="layout-catches-safe">Safe</div>);
