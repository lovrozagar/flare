import { createPage } from "@lovrozagar/flare/page";

export const route = createPage("_root_/about")
	.cache({ cdn: { maxAge: "1d", swr: "7d", tags: ["fs-paths"] }, isr: true })
	.render(() => <main data-testid="about">About</main>);
