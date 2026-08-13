import { createPage } from "flare/page"
import { lazy } from "flare/lazy"
import { Link } from "flare/link"

const FailingComp = lazy<Record<string, unknown>>({
	loader: () => Promise.reject(new Error("Chunk load failed")),
})

export const route = createPage("_root_/lazy-error-test")
	.render(() => (
		<main data-testid="lazy-error-page">
			<FailingComp />
			<nav>
				<Link to="/">Home</Link>
			</nav>
		</main>
	))
	.errorRender(() => <div data-testid="lazy-error-caught">Lazy load failed</div>)
