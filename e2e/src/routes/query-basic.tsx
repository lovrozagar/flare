import { createPage } from "flare/page"
import { useSuspenseQuery } from "flare/suspense-query"

function QueryCounter() {
	const query = useSuspenseQuery({
		queryFn: async () => ({ count: 42 }),
		queryKey: ["counter"],
	})
	return <span data-testid="query-count">{query.data()?.count}</span>
}

export const route = createPage("_root_/query-basic")
	.loader(() => ({ message: "from-loader" }))
	.render((props) => (
		<div data-testid="query-basic-page">
			<h1 data-testid="loader-msg">{props.loaderData.message}</h1>
			<QueryCounter />
		</div>
	))
