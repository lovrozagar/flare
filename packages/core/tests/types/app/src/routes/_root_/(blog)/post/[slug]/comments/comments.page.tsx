import { createPage } from "@lovrozagar/flare";

export const route = createPage("_root_/(blog)/post/[slug]/comments")
	.loader((ctx) => ({ reader: ctx.auth.userId }))
	.render((props) => <p>{props.loaderData.reader}</p>);
