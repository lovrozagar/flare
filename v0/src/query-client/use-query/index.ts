/**
 * useQuery - Main query hook for data fetching
 *
 * Based on TanStack Solid Query with Flare adaptations.
 *
 * @example
 * ```tsx
 * const query = useQuery(() => ({
 *   queryKey: ["posts"],
 *   queryFn: fetchPosts,
 * }))
 *
 * <Show when={query.isSuccess}>
 *   <For each={query.data}>{post => <PostCard post={post} />}</For>
 * </Show>
 * ```
 */

import type { DefaultError, QueryKey } from "@tanstack/query-core"
import { QueryObserver } from "@tanstack/query-core"
import type { Accessor } from "solid-js"
import { createMemo } from "solid-js"
import type { QueryClient } from "../query-client/index"
import type { DefinedInitialDataOptions, UndefinedInitialDataOptions } from "../query-options/index"
import type { DefinedUseQueryResult, UseQueryOptions, UseQueryResult } from "../types/index"
import { useBaseQuery } from "../use-base-query/index"

/* ============================================================================
 * useQuery
 * ============================================================================ */

export function useQuery<
	TQueryFnData = unknown,
	TError = DefaultError,
	TData = TQueryFnData,
	TQueryKey extends QueryKey = QueryKey,
>(
	options: UndefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey>,
	queryClient?: () => QueryClient,
): UseQueryResult<TData, TError>

export function useQuery<
	TQueryFnData = unknown,
	TError = DefaultError,
	TData = TQueryFnData,
	TQueryKey extends QueryKey = QueryKey,
>(
	options: DefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey>,
	queryClient?: () => QueryClient,
): DefinedUseQueryResult<TData, TError>

export function useQuery<
	TQueryFnData,
	TError = DefaultError,
	TData = TQueryFnData,
	TQueryKey extends QueryKey = QueryKey,
>(
	options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
	queryClient?: Accessor<QueryClient>,
) {
	return useBaseQuery(
		createMemo(() => options()),
		QueryObserver,
		queryClient,
	)
}
