import { createPage } from "flare/page"
import { useSuspenseQuery } from "flare/suspense-query"
import { For } from "solid-js"

interface LargeItem {
	id: number
	title: string
}

function LargeQuery() {
	const query = useSuspenseQuery<LargeItem[]>({
		queryFn: async () => Array.from({ length: 200 }, (_, i) => ({ id: i, title: `Item-${i}` })),
		queryKey: ["large-data"],
		staleTime: 60_000,
	})
	const items = () => query.data() ?? []
	return (
		<div>
			<span data-testid="large-count">{items().length}</span>
			<span data-testid="large-first">{items()[0]?.title}</span>
			<span data-testid="large-last">{items()[items().length - 1]?.title}</span>
			<ul>
				<For each={items()}>{(item) => <li>{item.title}</li>}</For>
			</ul>
		</div>
	)
}

export const route = createPage("_root_/query-large").render(() => (
	<div data-testid="query-large-page">
		<LargeQuery />
	</div>
))
