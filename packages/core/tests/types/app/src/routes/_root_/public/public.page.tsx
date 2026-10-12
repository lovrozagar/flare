import { createPage } from "@lovrozagar/flare";

export const route = createPage("_root_/public")
	.authorize((ctx) => ctx.auth === null || ctx.auth.userId !== "")
	.loader((ctx) => ({ signedIn: ctx.auth !== null }))
	.render((props) => <p>{String(props.loaderData.signedIn)}</p>);
