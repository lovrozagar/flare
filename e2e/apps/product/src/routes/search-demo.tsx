import { createPage } from "flare/page"
import { useRouter } from "flare/router"

export const route = createPage("_root_/search-demo")
	.loader((ctx) => {
		return {
			allParams: ctx.location.search,
			paramCount: Object.keys(ctx.location.search).length,
		}
	})
	.head((ctx) => ({
		title: `Search: ${JSON.stringify(ctx.loaderData.allParams)}`,
	}))
	.render((props) => {
		const router = useRouter()
		return (
			<div data-testid="search-demo-page">
				<h1>Search Demo</h1>
				<p data-testid="search-param-count">{props.loaderData.paramCount}</p>
				<p data-testid="search-all-params">{JSON.stringify(props.loaderData.allParams)}</p>
				<p data-testid="search-signal">{JSON.stringify(router.search())}</p>
				<p data-testid="search-q">{String(props.loaderData.allParams.q ?? "")}</p>
			</div>
		)
	})
