import { lazy } from "flare/lazy"
import { createPage } from "flare/page"

const LazyHeavy = lazy({
	loader: () => import("../components/lazy-heavy"),
	pending: () => <span data-testid="lazy-heavy-pending">Loading heavy...</span>,
})

export const route = createPage("_root_/lazy-test").render(() => (
	<main data-testid="lazy-test-page">
		<LazyHeavy />
	</main>
))
