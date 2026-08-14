import { createPage } from "flare/page"

export const route = createPage("_root_/props-demo")
	.preloader(() => ({ preloaderTimestamp: Date.now() }))
	.loader((ctx) => ({
		cause: ctx.cause,
		loaderTimestamp: Date.now(),
		prefetch: ctx.prefetch,
		preloaderTimestamp: ctx.preloaderContext.preloaderTimestamp,
	}))
	.render((props) => (
		<main data-testid="props-demo">
			<p data-testid="loader-cause">{props.loaderData.cause}</p>
			<p data-testid="loader-prefetch">{String(props.loaderData.prefetch)}</p>
			<p data-testid="location-pathname">{props.location.pathname}</p>
			<p data-testid="preloader-before-loader">
				{String(props.preloaderContext.preloaderTimestamp <= props.loaderData.loaderTimestamp)}
			</p>
		</main>
	))
