import { createPage } from "@lovrozagar/flare"

export const route = createPage("_root_/reviews")
	.loader((ctx) => ({ reviews: ctx.defer(async () => ({ quote: "good" })) }))
	.render(() => <p>reviews</p>)
