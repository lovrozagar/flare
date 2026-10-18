import { createPage } from "@lovrozagar/flare"

// The one route of the unregistered app, which has no register at all (dx/types.md `unregistered fallback`).
export const route = createPage("_root_/child")
	.loader(() => ({ n: 1 }))
	.render((props) => <p>{props.loaderData.n}</p>)
