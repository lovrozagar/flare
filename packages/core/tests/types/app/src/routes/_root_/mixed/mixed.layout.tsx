import { createLayout } from "@lovrozagar/flare"

// A layout with no auth method of its own over a child that authenticates: its loader gets the session (BUGS.md 358).
export const route = createLayout("_root_/mixed")
	.loader((ctx) => ({ seen: ctx.auth }))
	.render((props) => <main>{props.children}</main>)
