import { createPage } from "@lovrozagar/flare"

export const route = createPage("_root_/(blog)/post/[slug]")
	.preloader((): { role: "admin" } => ({ role: "admin" }))
	.loader((ctx) => ({ title: `${ctx.params.slug} by ${ctx.auth.userId}` }))
	.render((props) => <h1>{props.loaderData.title}</h1>)
