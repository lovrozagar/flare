import { createPage } from "flare/page"
import { useSuspenseQuery } from "flare/suspense-query"

function DynamicQuery(props: { id: string }) {
	const query = useSuspenseQuery({
		queryFn: async () => ({ id: props.id, name: `Item-${props.id}` }),
		queryKey: ["item", props.id],
		staleTime: 30_000,
	})
	return (
		<div>
			<span data-testid="dynamic-id">{query.data()?.id}</span>
			<span data-testid="dynamic-name">{query.data()?.name}</span>
		</div>
	)
}

export const route = createPage("_root_/query-dynamic/[id]")
	.loader((ctx) => ({ id: ctx.location.params.id }))
	.render((props) => (
		<div data-testid="query-dynamic-page">
			<DynamicQuery id={props.loaderData.id} />
		</div>
	))
