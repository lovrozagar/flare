import { createPage } from "@lovrozagar/flare"

// A literal clash with the blog layout's `role: "admin" | "editor"`: `role` is `never`, and the root's `requestId`
// still reads as a string (dx/types.md Merge, plan 21 11.2).
export const route = createPage("_root_/(blog)/viewer")
	.preloader((): { role: "viewer" } => ({ role: "viewer" }))
	.loader((ctx) => {
		const requestId: string = ctx.preloaderContext.requestId
		return { requestId }
	})
	.render((props) => <h1>{props.loaderData.requestId}</h1>)
