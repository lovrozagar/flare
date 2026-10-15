import { createPage } from "@lovrozagar/flare"

export const route = createPage("_root_/users/[id]")
	.loader(async (ctx) => ({ user: { name: ctx.params.id } }))
	.head((ctx) => ({ title: ctx.loaderData.user.name }))
	.render((props) => <p>{props.loaderData.user.name}</p>)
