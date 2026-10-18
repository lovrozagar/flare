import { createPage } from "@lovrozagar/flare"

// The one route of the hand-written register: it requires auth, and its listed parent has no module.
export const route = createPage("_root_/child")
	.authenticate()
	.loader(() => ({ n: 1 }))
	.render((props) => <p>{props.loaderData.n}</p>)
