import { createPage } from "@lovrozagar/flare/page";
import { useSuspenseQuery } from "@lovrozagar/flare/suspense-query";

/**
 * Tests that FlareState.q is populated during SSR when queryClientGetter is provided.
 * After hydration, reads FlareState from window to verify query data was serialized.
 */
function StateQuery() {
	const query = useSuspenseQuery({
		queryFn: async () => ({ payload: "state-check" }),
		queryKey: ["state-check"],
	});
	return <span data-testid="state-query-data">{query.data()?.payload}</span>;
}

export const route = createPage("_root_/query-flare-state")
	.loader(() => ({ ok: true }))
	.render((props) => (
		<div data-testid="query-flare-state-page">
			<p data-testid="loader-ok">{String(props.loaderData.ok)}</p>
			<StateQuery />
		</div>
	));
