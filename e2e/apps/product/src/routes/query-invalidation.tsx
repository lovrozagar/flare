import { createPage } from "flare/page"
import { useSuspenseQuery } from "flare/suspense-query"

function InvalidationQuery() {
	const query = useSuspenseQuery({
		queryFn: async () => ({ ts: Date.now() }),
		queryKey: ["inv-counter"],
		staleTime: 0,
	})

	const handleInvalidate = async () => {
		const w = window as unknown as Record<string, unknown>
		const qc = w.__flareQueryClient as
			| { invalidateQueries: (opts: { queryKey: unknown[] }) => Promise<void> }
			| undefined
		if (qc) {
			await qc.invalidateQueries({ queryKey: ["inv-counter"] })
		}
	}

	return (
		<div>
			<span data-testid="inv-ts">{query.data()?.ts}</span>
			<span data-testid="qi-ts">{query.data()?.ts}</span>
			<button data-testid="invalidate-btn" onClick={handleInvalidate} type="button">
				Invalidate
			</button>
			<button data-testid="qi-invalidate" onClick={handleInvalidate} type="button">
				Invalidate
			</button>
		</div>
	)
}

export const route = createPage("_root_/query-invalidation").render(() => (
	<div data-testid="query-invalidation-page">
		<InvalidationQuery />
	</div>
))
