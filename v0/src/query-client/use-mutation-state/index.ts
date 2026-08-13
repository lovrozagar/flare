/**
 * useMutationState - Access mutation state across the cache
 *
 * Provides reactive access to all mutations matching a filter,
 * useful for tracking pending operations globally.
 *
 * @example
 * ```tsx
 * const pendingPosts = useMutationState(() => ({
 *   filters: { mutationKey: ["createPost"], status: "pending" },
 *   select: (mutation) => mutation.state.variables,
 * }))
 *
 * <For each={pendingPosts()}>
 *   {post => <PendingPostCard title={post.title} />}
 * </For>
 * ```
 */

import type { Mutation, MutationCache, MutationFilters, MutationState } from "@tanstack/query-core"
import { replaceEqualDeep } from "@tanstack/query-core"
import type { Accessor } from "solid-js"
import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import type { QueryClient } from "../query-client/index"
import { useQueryClient } from "../query-client-provider/index"

/* ============================================================================
 * Types
 * ============================================================================ */

type MutationStateOptions<TResult = MutationState> = {
	filters?: MutationFilters
	select?: (mutation: Mutation) => TResult
}

/* ============================================================================
 * Helper
 * ============================================================================ */

function getResult<TResult = MutationState>(
	mutationCache: MutationCache,
	options: MutationStateOptions<TResult>,
): Array<TResult> {
	return mutationCache
		.findAll(options.filters)
		.map(
			(mutation): TResult =>
				(options.select ? options.select(mutation) : mutation.state) as TResult,
		)
}

/* ============================================================================
 * useMutationState
 * ============================================================================ */

export function useMutationState<TResult = MutationState>(
	options: Accessor<MutationStateOptions<TResult>> = () => ({}),
	queryClient?: Accessor<QueryClient>,
): Accessor<Array<TResult>> {
	const client = createMemo(() => queryClient?.() ?? useQueryClient())
	const mutationCache = createMemo(() => client().getMutationCache())

	const [result, setResult] = createSignal(getResult(mutationCache(), options()))

	createEffect(() => {
		const unsubscribe = mutationCache().subscribe(() => {
			const nextResult = replaceEqualDeep(result(), getResult(mutationCache(), options()))
			if (result() !== nextResult) {
				setResult(nextResult)
			}
		})

		onCleanup(unsubscribe)
	})

	return result
}
