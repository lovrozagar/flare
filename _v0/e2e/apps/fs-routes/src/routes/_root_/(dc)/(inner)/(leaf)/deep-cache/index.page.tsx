import { Link } from "@lovrozagar/flare/link";
import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/(dc)/(inner)/(leaf)/deep-cache")
	.cache({ cdn: { maxAge: "1d", swr: "7d", tags: ["fs-paths"] }, isr: true })
	.render(() => (
		<main data-testid="deep-cache">
			Deep cache
			<Link data-testid="to-uncached" prefetch={false} to="/deep-cache/uncached">
				Uncached
			</Link>
		</main>
	));
