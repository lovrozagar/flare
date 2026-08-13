/**
 * queryOptions - Type-safe query options builder
 *
 * Provides type inference for query options, making it easier to create
 * reusable query configurations.
 *
 * @example
 * ```tsx
 * const postsQueryOptions = queryOptions({
 *   queryKey: ["posts"],
 *   queryFn: fetchPosts,
 * })
 *
 * // Use in useQuery
 * const query = useQuery(() => postsQueryOptions)
 *
 * // Use for prefetching
 * queryClient.prefetchQuery(postsQueryOptions)
 * ```
 */

import type { DataTag, DefaultError, QueryKey } from "@tanstack/query-core"
import type { Accessor } from "solid-js"
import type { SolidQueryOptions } from "../types/index"

/* ============================================================================
 * Types
 * ============================================================================ */

export type UndefinedInitialDataOptions<
	TQueryFnData = unknown,
	TError = DefaultError,
	TData = TQueryFnData,
	TQueryKey extends QueryKey = QueryKey,
> = Accessor<
	SolidQueryOptions<TQueryFnData, TError, TData, TQueryKey> & {
		initialData?: undefined
	}
>

export type DefinedInitialDataOptions<
	TQueryFnData = unknown,
	TError = DefaultError,
	TData = TQueryFnData,
	TQueryKey extends QueryKey = QueryKey,
> = Accessor<
	SolidQueryOptions<TQueryFnData, TError, TData, TQueryKey> & {
		initialData: TQueryFnData | (() => TQueryFnData)
	}
>

/* ============================================================================
 * queryOptions
 * ============================================================================ */

export function queryOptions<
	TQueryFnData = unknown,
	TError = DefaultError,
	TData = TQueryFnData,
	TQueryKey extends QueryKey = QueryKey,
>(
	options: ReturnType<UndefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey>>,
): ReturnType<UndefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey>> & {
	queryKey: DataTag<TQueryKey, TQueryFnData, TError>
}

export function queryOptions<
	TQueryFnData = unknown,
	TError = DefaultError,
	TData = TQueryFnData,
	TQueryKey extends QueryKey = QueryKey,
>(
	options: ReturnType<DefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey>>,
): ReturnType<DefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey>> & {
	queryKey: DataTag<TQueryKey, TQueryFnData, TError>
}

export function queryOptions(options: unknown) {
	return options
}
