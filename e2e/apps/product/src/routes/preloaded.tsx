import { Link } from "flare/link"
import { createPage } from "flare/page"

export const route = createPage("_root_/preloaded")
	.preloader(() => ({
		preloadedAt: Date.now(),
	}))
	.loader((ctx) => ({
		loaderRanAfterPreload: ctx.preloaderContext.preloadedAt > 0,
		preloadTimestamp: ctx.preloaderContext.preloadedAt,
	}))
	.render((props) => (
		<main data-testid="preloaded">
			<h1 data-testid="preload-heading">Preloaded</h1>
			<p data-testid="preload-ts">{String(props.loaderData.preloadTimestamp)}</p>
			<p data-testid="preload-order">{String(props.loaderData.loaderRanAfterPreload)}</p>
			<nav>
				<Link to="/">Home</Link>
			</nav>
		</main>
	))
