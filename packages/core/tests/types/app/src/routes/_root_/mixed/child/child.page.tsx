import { createPage } from "@lovrozagar/flare"

// The child that requires auth under the mixed layout (BUGS.md 358).
export const route = createPage("_root_/mixed/child")
	.authenticate()
	.loader(() => ({ n: 1 }))
	.render(() => null)
