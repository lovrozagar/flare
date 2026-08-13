import { createPage } from "flare/page"
import { clientLazy, lazy } from "flare/lazy"
import { Link } from "flare/link"

const LazyHeavy = lazy({
	loader: () => import("../components/lazy-heavy"),
	pending: () => <span data-testid="lazy-heavy-pending">Loading heavy...</span>,
})

const ClientWidget = clientLazy({
	loader: () => import("../components/lazy-client-widget"),
})

const ClientWidgetEager = clientLazy({
	eager: true,
	loader: () => import("../components/lazy-client-widget"),
})

export const route = createPage("_root_/lazy-test").render(() => (
	<main data-testid="lazy-test-page">
		<h1>Lazy Test</h1>
		<section data-testid="lazy-section">
			<LazyHeavy />
		</section>
		<section data-testid="client-widget-section">
			<ClientWidget />
		</section>
		<section data-testid="client-widget-eager-section">
			<ClientWidgetEager />
		</section>
		<nav>
			<Link to="/">Home</Link>
		</nav>
	</main>
))
