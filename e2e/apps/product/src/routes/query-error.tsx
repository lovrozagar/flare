import { createPage } from "@lovrozagar/flare/page";
import { useSuspenseQuery } from "@lovrozagar/flare/suspense-query";
import { ErrorBoundary, Suspense } from "solid-js";

function FailingQuery() {
	const query = useSuspenseQuery({
		queryFn: () => Promise.reject(new Error("query-exploded")),
		queryKey: ["failing-query"],
		retry: false,
	});
	return <span>{String(query.data())}</span>;
}

export const route = createPage("_root_/query-error").render(() => (
	<div data-testid="query-error-page">
		<ErrorBoundary
			fallback={(err) => (
				<div data-testid="query-error-boundary">
					<h1>Query Error</h1>
					<p data-testid="query-error-msg">{err.message}</p>
				</div>
			)}
		>
			<Suspense fallback={<div>Loading...</div>}>
				<FailingQuery />
			</Suspense>
		</ErrorBoundary>
	</div>
));
