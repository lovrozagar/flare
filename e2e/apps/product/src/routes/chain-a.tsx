import { createPage } from "@lovrozagar/flare/page";
import { redirect } from "@lovrozagar/flare/errors";

export const route = createPage("_root_/chain-a")
	.loader(() => {
		throw redirect({ status: 302, to: "/chain-b" });
	})
	.render(() => <div>Should not render (chain-a)</div>);
