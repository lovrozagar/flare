import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/account")
	.authenticate()
	/* `ctx.env` is the server's env type, not `unknown` */
	.loader((ctx) => ({ greeting: ctx.env.GREETING.toUpperCase(), userId: ctx.auth.userId }))
	.render((props) => (
		<p>
			{props.loaderData.greeting} {props.loaderData.userId}
		</p>
	));
