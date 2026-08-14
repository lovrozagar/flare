import { createPage } from "flare/page"

export const route = createPage("_root_/_internal")
	.cache({ cdn: { maxAge: "1d", swr: "7d", tags: ["fs-paths"] }, isr: true })
	.render(() => <main data-testid="internal">Internal</main>)
