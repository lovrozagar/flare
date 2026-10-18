import { createLayout } from "@lovrozagar/flare"

// A public layout that only authorizes: the chain reads the session from here down (BUGS.md 358).
export const route = createLayout("_root_/gated")
	.authorize((ctx) => ctx.auth !== null)
	.loader((ctx) => ({ seenInLayout: ctx.auth }))
	.render((props) => <main>{props.children}</main>)
