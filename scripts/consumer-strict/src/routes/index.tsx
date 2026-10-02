import { createPage } from "@lovrozagar/flare/page";

/* Optional auth: anonymous requests get `ctx.auth === null`. */
export const route = createPage("_root_/")
	.authenticate("optional")
	.loader((ctx) => {
		/* Registered only when codegen follows the server entry to the router's queryClientGetter. */
		ctx.queryClient.setQueryData(["home"], 1);
		// @ts-expect-error optional auth may be null
		const required: string = ctx.auth.userId;
		return { required, userId: ctx.auth?.userId ?? null };
	})
	.render((props) => <p>{props.loaderData.userId ?? "anonymous"}</p>);
