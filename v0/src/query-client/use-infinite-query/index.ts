/**
 * useInfiniteQuery - Infinite/paginated query hook
 *
 * Based on TanStack Solid Query with Flare adaptations.
 *
 * @example
 * ```tsx
 * const query = useInfiniteQuery(() => ({
 *   queryKey: ["posts", "infinite"],
 *   queryFn: ({ pageParam }) => fetchPosts({ cursor: pageParam }),
 *   initialPageParam: 0,
 *   getNextPageParam: (lastPage) => lastPage.nextCursor,
 * }))
 *
 * <For each={query.data?.pages.flat()}>
 *   {post => <PostCard post={post} />}
 * </For>
 * <button onClick={() => query.fetchNextPage()} disabled={!query.hasNextPage}>
 *   Load More
 * </button>
 * ```
 */

import type { DefaultError, InfiniteData, QueryKey, QueryObserver } from "@tanstack/query-core"
import { InfiniteQueryObserver } from "@tanstack/query-core"
import type { Accessor } from "solid-js"
import { createMemo } from "solid-js"
import type {
	DefinedInitialDataInfiniteOptions,
	UndefinedInitialDataInfiniteOptions,
} from "../infinite-query-options/index"
import type { QueryClient } from "../query-client/index"
import type {
	DefinedUseInfiniteQueryResult,
	UseInfiniteQueryOptions,
	UseInfiniteQueryResult,
} from "../types/index"
import { useBaseQuery } from "../use-base-query/index"

/* ============================================================================
 * useInfiniteQuery
 * ============================================================================ */

export function useInfiniteQuery<
	TQueryFnData,
	TError = DefaultError,
	TData = InfiniteData<TQueryFnData>,
	TQueryKey extends QueryKey = QueryKey,
	TPageParam = unknown,
>(
	options: DefinedInitialDataInfiniteOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>,
	queryClient?: Accessor<QueryClient>,
): DefinedUseInfiniteQueryResult<TData, TError>

export function useInfiniteQuery<
	TQueryFnData,
	TError = DefaultError,
	TData = InfiniteData<TQueryFnData>,
	TQueryKey extends QueryKey = QueryKey,
	TPageParam = unknown,
>(
	options: UndefinedInitialDataInfiniteOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>,
	queryClient?: Accessor<QueryClient>,
): UseInfiniteQueryResult<TData, TError>

export function useInfiniteQuery<
	TQueryFnData,
	TError = DefaultError,
	TData = InfiniteData<TQueryFnData>,
	TQueryKey extends QueryKey = QueryKey,
	TPageParam = unknown,
>(
	options: UseInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>,
	queryClient?: Accessor<QueryClient>,
): UseInfiniteQueryResult<TData, TError> {
	return useBaseQuery(
		createMemo(() => options()),
		InfiniteQueryObserver as typeof QueryObserver,
		queryClient,
	) as UseInfiniteQueryResult<TData, TError>
}
