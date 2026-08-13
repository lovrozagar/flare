import { createPage } from "flare/page"
import { useSuspenseQuery } from "flare/suspense-query"

function DeferredItem() {
	const query = useSuspenseQuery({
		queryFn: async () => ({ name: "fallback" }),
		queryKey: ["deferred-item"],
		staleTime: 60_000,
	})
	return <span data-testid="deferred-item">{query.data()?.name}</span>
}

export const route = createPage("_root_/query-deferred")
	.loader((ctx) => {
		ctx.defer(async () => {
			await new Promise((r) => setTimeout(r, 100))
			ctx.queryClient.setQueryData(["deferred-item"], { name: "from-deferred" })
		})
		return { shell: "ready" }
	})
	.render((props) => (
		<div data-testid="query-deferred-page">
			<p data-testid="shell">{props.loaderData.shell}</p>
			<DeferredItem />
		</div>
	))
