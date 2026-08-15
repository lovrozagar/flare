import { createPage } from "@lovrozagar/flare/page";
import { redirect } from "@lovrozagar/flare/errors";

export const route = createPage("_root_/old-page")
	.loader(() => {
		throw redirect({ status: 302, to: "/about" });
	})
	.render(() => <div>Should not render</div>);
