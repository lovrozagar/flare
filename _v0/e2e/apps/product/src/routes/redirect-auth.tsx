import { createPage } from "@lovrozagar/flare/page";
import { redirect } from "@lovrozagar/flare/errors";

export const route = createPage("_root_/redirect-auth")
	.authenticate()
	.loader(() => {
		throw redirect({ status: 302, to: "/redirect-target" });
	})
	.render(() => <div>Should not render (redirect-auth)</div>);
