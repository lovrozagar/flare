import { redirect } from "@lovrozagar/flare/errors";
import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/old-page")
	.loader(() => {
		throw redirect({ to: "/about" });
	})
	.render(() => <div>Should not render</div>);
