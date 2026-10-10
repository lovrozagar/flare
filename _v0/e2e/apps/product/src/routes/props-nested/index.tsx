import { createPage } from "@lovrozagar/flare/page";

/**
 * Child page under props-nested layout — tests that page preloaderContext
 * is independent from layout preloaderContext. Both run their own preloader.
 */
export const route = createPage("_root_/(props-nested)/props-nested/")
	.preloader((ctx) => ({
		hasRequest: ctx.request instanceof Request,
		pagePreloaderRan: true,
		pageTimestamp: Date.now(),
		pathname: ctx.location.pathname,
	}))
	.loader((ctx) => ({
		pageLoaderRan: true,
		pagePreloaderTimestamp: ctx.preloaderContext.pageTimestamp,
		pathname: ctx.location.pathname,
	}))
	.head((ctx) => ({
		description: `Page preloader ran: ${ctx.preloaderContext.pagePreloaderRan}`,
		title: `Props Nested - ${ctx.loaderData.pathname}`,
	}))
	.render((props) => (
		<div data-testid="props-nested-page">
			<h1>Props Nested Page</h1>

			{/* Page render props */}
			<div data-testid="page-loader-ran">{String(props.loaderData.pageLoaderRan)}</div>
			<div data-testid="page-loader-pathname">{props.loaderData.pathname}</div>
			<div data-testid="page-preloader-ran">{String(props.preloaderContext.pagePreloaderRan)}</div>
			<div data-testid="page-preloader-timestamp">{props.preloaderContext.pageTimestamp}</div>
			<div data-testid="page-preloader-pathname">{props.preloaderContext.pathname}</div>
			<div data-testid="page-preloader-has-request">{String(props.preloaderContext.hasRequest)}</div>
			<div data-testid="page-location-pathname">{props.location.pathname}</div>

			{/* Verify preloader timestamp passed to loader correctly */}
			<div data-testid="page-preloader-ts-match">
				{String(props.preloaderContext.pageTimestamp === props.loaderData.pagePreloaderTimestamp)}
			</div>
		</div>
	));
