import { createPage } from "@lovrozagar/flare/page";
import { useSuspenseQuery } from "@lovrozagar/flare/suspense-query";

/**
 * Tests SSR → client query hydration.
 * The queryFn returns server-side timestamp during SSR.
 * After hydration, client should have the SSR data (no refetch).
 */
function TimestampQuery() {
	const query = useSuspenseQuery({
		queryFn: async () => ({
			source: typeof window === "undefined" ? "server" : "client",
			ts: Date.now(),
		}),
		queryKey: ["hydration-ts"],
		staleTime: 60_000,
	});
	return (
		<div>
			<span data-testid="query-source">{query.data()?.source}</span>
			<span data-testid="query-ts">{query.data()?.ts}</span>
		</div>
	);
}

export const route = createPage("_root_/query-hydration")
	.loader(() => ({ ready: true }))
	.render((props) => (
		<div data-testid="query-hydration-page">
			<p data-testid="loader-ready">{String(props.loaderData.ready)}</p>
			<TimestampQuery />
		</div>
	));
