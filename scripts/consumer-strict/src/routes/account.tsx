import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/account")
	.authenticate()
	.loader((ctx) => ({ userId: ctx.auth.userId }))
	.render((props) => <p>{props.loaderData.userId}</p>);
