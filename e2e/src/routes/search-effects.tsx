import { createPage } from "flare/page"

export const route = createPage("_root_/search-effects")
	.effects({
		loaderDeps: ({ search }: { search: Record<string, string> }) => [search.q ?? ""],
	})
	.loader((ctx) => ({
		deps: ctx.deps,
		q: ctx.location.search.q ?? "",
		timestamp: Date.now(),
	}))
	.render((props) => (
		<div data-testid="search-effects-page">
			<div data-testid="effects-q">{props.loaderData.q}</div>
			<div data-testid="effects-deps">{JSON.stringify(props.loaderData.deps)}</div>
			<div data-testid="effects-timestamp">{props.loaderData.timestamp}</div>
		</div>
	))
