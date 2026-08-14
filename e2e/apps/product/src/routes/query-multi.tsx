import { createPage } from "flare/page"
import { useSuspenseQuery } from "flare/suspense-query"

/**
 * Tests multiple useSuspenseQuery calls on the same page.
 * Validates that multiple queries coexist and hydrate correctly.
 */
function UserQuery() {
	const query = useSuspenseQuery({
		queryFn: async () => ({ name: "Alice", role: "admin" }),
		queryKey: ["user"],
		staleTime: 30_000,
	})
	return (
		<div data-testid="user-data">
			<span data-testid="user-name">{query.data()?.name}</span>
			<span data-testid="user-role">{query.data()?.role}</span>
		</div>
	)
}

function ItemsQuery() {
	const query = useSuspenseQuery({
		queryFn: async () => [
			{ id: 1, title: "Item A" },
			{ id: 2, title: "Item B" },
		],
		queryKey: ["items"],
		staleTime: 30_000,
	})
	return (
		<div data-testid="items-data">
			<span data-testid="items-count">{query.data()?.length}</span>
			<span data-testid="items-first">{query.data()?.[0]?.title}</span>
		</div>
	)
}

export const route = createPage("_root_/query-multi").render(() => (
	<div data-testid="query-multi-page">
		<h1>Multiple Queries</h1>
		<UserQuery />
		<ItemsQuery />
	</div>
))
