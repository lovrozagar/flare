import { createPage } from "@lovrozagar/flare/page";

/**
 * Exercises every builder prop: preloader → loader → head → render.
 * Exposes all render props as data-testid attributes for E2E verification.
 */
export const route = createPage("_root_/props-demo")
	.preloader((ctx) => ({
		authPresent: ctx.auth !== null && ctx.auth !== undefined,
		envType: typeof ctx.env,
		hasAbortController: ctx.abortController instanceof AbortController,
		hasRequest: ctx.request instanceof Request,
		locationPathname: ctx.location.pathname,
		preloaderTimestamp: Date.now(),
	}))
	.loader((ctx) => ({
		cause: ctx.cause,
		hasDeps: Array.isArray(ctx.deps),
		hasEnv: typeof ctx.env !== "undefined",
		hasRequest: ctx.request instanceof Request,
		loaderTimestamp: Date.now(),
		locationPathname: ctx.location.pathname,
		prefetch: ctx.prefetch,
		preloaderTimestamp: ctx.preloaderContext.preloaderTimestamp,
	}))
	.head((ctx) => ({
		description: `Cause: ${ctx.cause}, Prefetch: ${ctx.prefetch}`,
		title: `Props Demo - ${ctx.loaderData.locationPathname}`,
	}))
	.render((props) => (
		<main data-testid="props-demo">
			<h1>Props Demo</h1>

			{/* Verify loaderData prop */}
			<div data-testid="loader-data-present">{String(typeof props.loaderData === "object")}</div>
			<div data-testid="loader-cause">{props.loaderData.cause}</div>
			<div data-testid="loader-pathname">{props.loaderData.locationPathname}</div>
			<div data-testid="loader-has-request">{String(props.loaderData.hasRequest)}</div>
			<div data-testid="loader-has-env">{String(props.loaderData.hasEnv)}</div>
			<div data-testid="loader-has-deps">{String(props.loaderData.hasDeps)}</div>
			<div data-testid="loader-prefetch">{String(props.loaderData.prefetch)}</div>
			<div data-testid="loader-timestamp">{props.loaderData.loaderTimestamp}</div>

			{/* Verify preloaderContext prop */}
			<div data-testid="preloader-context-present">{String(typeof props.preloaderContext === "object")}</div>
			<div data-testid="preloader-timestamp">{props.preloaderContext.preloaderTimestamp}</div>
			<div data-testid="preloader-pathname">{props.preloaderContext.locationPathname}</div>
			<div data-testid="preloader-has-abort">{String(props.preloaderContext.hasAbortController)}</div>
			<div data-testid="preloader-has-request">{String(props.preloaderContext.hasRequest)}</div>
			<div data-testid="preloader-env-type">{props.preloaderContext.envType}</div>
			<div data-testid="preloader-auth-present">{String(props.preloaderContext.authPresent)}</div>

			{/* Verify location prop */}
			<div data-testid="location-present">{String(typeof props.location === "object")}</div>
			<div data-testid="location-pathname">{props.location.pathname}</div>
			<div data-testid="location-search">{JSON.stringify(props.location.search)}</div>
			<div data-testid="location-params">{JSON.stringify(props.location.params)}</div>

			{/* Verify preloader → loader timestamp ordering */}
			<div data-testid="preloader-before-loader">
				{String(props.preloaderContext.preloaderTimestamp <= props.loaderData.loaderTimestamp)}
			</div>

			{/* Verify preloaderContext.preloaderTimestamp matches loader's received value */}
			<div data-testid="preloader-timestamp-match">
				{String(props.preloaderContext.preloaderTimestamp === props.loaderData.preloaderTimestamp)}
			</div>
		</main>
	));
