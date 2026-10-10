import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/(dc)/(inner)/(leaf)/deep-cache/uncached")
	.cache({ client: { prefetch: false, staleTime: 0 } })
	.render(() => <main data-testid="deep-uncached">Uncached</main>);
