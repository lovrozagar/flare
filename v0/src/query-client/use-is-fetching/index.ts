/**
 * useIsFetching - Track number of active queries
 *
 * Returns a reactive count of queries currently fetching.
 *
 * @example
 * ```tsx
 * const isFetching = useIsFetching()
 *
 * <Show when={isFetching() > 0}>
 *   <GlobalLoadingIndicator />
 * </Show>
 * ```
 */

import type { QueryFilters } from "@tanstack/query-core"
import type { Accessor } from "solid-js"
import { createMemo, createSignal, onCleanup } from "solid-js"
import type { QueryClient } from "../query-client/index"
import { useQueryClient } from "../query-client-provider/index"

/* ============================================================================
 * useIsFetching
 * ============================================================================ */

export function useIsFetching(
	filters?: Accessor<QueryFilters>,
	queryClient?: Accessor<QueryClient>,
): Accessor<number> {
	const client = createMemo(() => queryClient?.() ?? useQueryClient())
	const queryCache = createMemo(() => client().getQueryCache())

	const [fetches, setFetches] = createSignal(client().isFetching(filters?.()))

	const unsubscribe = queryCache().subscribe(() => {
		setFetches(client().isFetching(filters?.()))
	})

	onCleanup(unsubscribe)

	return fetches
}
