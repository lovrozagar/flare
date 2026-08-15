import { notFound } from "@lovrozagar/flare/errors";
import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/throw-not-found")
	.loader(() => {
		notFound();
	})
	.render(() => <div>Should not render</div>);
