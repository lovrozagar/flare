import { createLayout } from "@lovrozagar/flare/layout";

/**
 * Layout with preloader — tests preloaderContext on layout render props
 * and that layout preloaderContext is independent from child page preloaderContext.
 */
export const route = createLayout("_root_/(props-nested)")
	.preloader((ctx) => ({
		layoutPreloaderRan: true,
		layoutTimestamp: Date.now(),
		pathname: ctx.location.pathname,
	}))
	.loader((ctx) => ({
		layoutLoaderRan: true,
		layoutPreloaderTimestamp: ctx.preloaderContext.layoutTimestamp,
	}))
	.render((props) => (
		<div data-testid="props-nested-layout">
			{/* Layout render props verification */}
			<div data-testid="layout-loader-data">{String(props.loaderData.layoutLoaderRan)}</div>
			<div data-testid="layout-preloader-ran">{String(props.preloaderContext.layoutPreloaderRan)}</div>
			<div data-testid="layout-preloader-timestamp">{props.preloaderContext.layoutTimestamp}</div>
			<div data-testid="layout-preloader-pathname">{props.preloaderContext.pathname}</div>
			<div data-testid="layout-loader-preloader-ts">{props.loaderData.layoutPreloaderTimestamp}</div>
			<div data-testid="layout-children-present">{String(typeof props.children !== "undefined")}</div>
			<div data-testid="layout-location-pathname">{props.location.pathname}</div>
			<div data-testid="props-nested-content">{props.children}</div>
		</div>
	));
