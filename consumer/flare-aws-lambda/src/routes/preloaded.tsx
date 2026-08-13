import { createPage } from "flare/page"

export const route = createPage("_root_/preloaded")
	.preloader((ctx) => {
		const ua = ctx.request.headers.get("user-agent") ?? "unknown"
		return {
			preloadedAt: Date.now(),
			short: ua.slice(0, 20),
			uaLength: ua.length,
		}
	})
	.loader((ctx) => {
		return {
			loaderRanAfterPreload: ctx.preloaderContext.preloadedAt > 0,
			platform: "AWS Lambda",
			preloadTimestamp: ctx.preloaderContext.preloadedAt,
			uaLength: ctx.preloaderContext.uaLength,
			uaShort: ctx.preloaderContext.short,
		}
	})
	.render((props) => (
		<div>
			<h1 data-testid="preload-heading">Preloaded — AWS Lambda</h1>
			<dl>
				<dt>Preload Timestamp</dt>
				<dd data-testid="preload-ts">{String(props.loaderData.preloadTimestamp)}</dd>
				<dt>Loader Ran After Preload</dt>
				<dd data-testid="preload-order">{String(props.loaderData.loaderRanAfterPreload)}</dd>
				<dt>UA Length</dt>
				<dd data-testid="preload-ua-len">{String(props.loaderData.uaLength)}</dd>
				<dt>UA Short</dt>
				<dd data-testid="preload-ua-short">{props.loaderData.uaShort}</dd>
				<dt>Platform</dt>
				<dd data-testid="preload-platform">{props.loaderData.platform}</dd>
			</dl>
			<nav>
				<a href="/">Home</a>
			</nav>
		</div>
	))
