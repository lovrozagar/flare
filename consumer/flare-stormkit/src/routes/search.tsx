import { createPage } from "flare/page"

export const route = createPage("_root_/search")
	.loader((ctx) => {
		const q = ctx.location.search.q ?? ""
		const page = ctx.location.search.page ?? "1"
		const url = new URL(ctx.request.url)
		return {
			hostname: url.hostname,
			page: String(page),
			paramCount: Object.keys(ctx.location.search).length,
			q: String(q),
		}
	})
	.head((ctx) => ({
		title: `Search: ${(ctx.loaderData as { q: string }).q || "empty"}`,
	}))
	.render((props) => (
		<div>
			<h1 data-testid="search-heading">Search — Stormkit</h1>
			<dl>
				<dt>Query</dt>
				<dd data-testid="search-q">{props.loaderData.q}</dd>
				<dt>Page</dt>
				<dd data-testid="search-page">{props.loaderData.page}</dd>
				<dt>Param Count</dt>
				<dd data-testid="search-count">{String(props.loaderData.paramCount)}</dd>
				<dt>Hostname</dt>
				<dd data-testid="search-hostname">{props.loaderData.hostname}</dd>
			</dl>
			<nav>
				<a href="/">Home</a>
			</nav>
		</div>
	))
