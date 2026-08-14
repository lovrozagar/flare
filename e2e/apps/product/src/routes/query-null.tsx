import { createPage } from "flare/page"
import { useSuspenseQuery } from "flare/suspense-query"

function NullQuery() {
	const query = useSuspenseQuery({
		queryFn: async () => null,
		queryKey: ["null-query"],
	})
	return <span data-testid="null-data">{String(query.data())}</span>
}

export const route = createPage("_root_/query-null").render(() => (
	<div data-testid="query-null-page">
		<NullQuery />
	</div>
))
