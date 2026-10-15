import { createPage } from "@lovrozagar/flare"

export const route = createPage("_root_/guest")
	.authenticateOptional()
	.loader((ctx) => ({ name: ctx.auth?.userId ?? "guest" }))
	.render((props) => <p>{props.loaderData.name}</p>)
