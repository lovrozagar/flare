import { redirect } from "@lovrozagar/flare/errors";
import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/redirect-external")
	.loader(() => {
		throw redirect({ href: "https://example.com" });
	})
	.render(() => <div>Should not render</div>);
