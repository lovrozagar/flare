import { redirect } from "@lovrozagar/flare/errors";
import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/redirect-308")
	.loader(() => {
		throw redirect({ status: 308, to: "/about" });
	})
	.render(() => <div>no</div>);
