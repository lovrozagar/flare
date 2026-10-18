import { createPage } from "@lovrozagar/flare"

// A page with no auth method under the authorize-only layout (BUGS.md 358).
export const route = createPage("_root_/gated/inner")
	.loader((ctx) => ({ seenInPage: ctx.auth }))
	.render(() => null)
