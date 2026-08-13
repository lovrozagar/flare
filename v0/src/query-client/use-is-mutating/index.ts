/**
 * useIsMutating - Track number of active mutations
 *
 * Returns a reactive count of mutations currently in progress.
 *
 * @example
 * ```tsx
 * const isMutating = useIsMutating()
 *
 * <Show when={isMutating() > 0}>
 *   <SavingIndicator />
 * </Show>
 * ```
 */

import type { MutationFilters } from "@tanstack/query-core"
import type { Accessor } from "solid-js"
import { createMemo, createSignal, onCleanup } from "solid-js"
import type { QueryClient } from "../query-client/index"
import { useQueryClient } from "../query-client-provider/index"

/* ============================================================================
 * useIsMutating
 * ============================================================================ */

export function useIsMutating(
	filters?: Accessor<MutationFilters>,
	queryClient?: Accessor<QueryClient>,
): Accessor<number> {
	const client = createMemo(() => queryClient?.() ?? useQueryClient())
	const mutationCache = createMemo(() => client().getMutationCache())

	const [mutations, setMutations] = createSignal(client().isMutating(filters?.()))

	const unsubscribe = mutationCache().subscribe(() => {
		setMutations(client().isMutating(filters?.()))
	})

	onCleanup(unsubscribe)

	return mutations
}
