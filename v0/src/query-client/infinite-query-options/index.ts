/**
 * infiniteQueryOptions - Type-safe infinite query options builder
 *
 * Provides type inference for infinite query options, making it easier to create
 * reusable query configurations for paginated data.
 *
 * @example
 * ```tsx
 * const postsInfiniteQueryOptions = infiniteQueryOptions({
 *   queryKey: ["posts", "infinite"],
 *   queryFn: ({ pageParam }) => fetchPosts({ cursor: pageParam }),
 *   initialPageParam: 0,
 *   getNextPageParam: (lastPage) => lastPage.nextCursor,
 * })
 *
 * // Use in useInfiniteQuery
 * const query = useInfiniteQuery(() => postsInfiniteQueryOptions)
 * ```
 */

import type {
	DataTag,
	DefaultError,
	InfiniteData,
	NonUndefinedGuard,
	QueryKey,
} from "@tanstack/query-core"
import type { Accessor } from "solid-js"
import type { SolidInfiniteQueryOptions } from "../types/index"

/* ============================================================================
 * Types
 * ============================================================================ */

export type UndefinedInitialDataInfiniteOptions<
	TQueryFnData,
	TError = DefaultError,
	TData = InfiniteData<TQueryFnData>,
	TQueryKey extends QueryKey = QueryKey,
	TPageParam = unknown,
> = Accessor<
	SolidInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam> & {
		initialData?: undefined
	}
>

export type DefinedInitialDataInfiniteOptions<
	TQueryFnData,
	TError = DefaultError,
	TData = InfiniteData<TQueryFnData>,
	TQueryKey extends QueryKey = QueryKey,
	TPageParam = unknown,
> = Accessor<
	SolidInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam> & {
		initialData:
			| NonUndefinedGuard<InfiniteData<TQueryFnData, TPageParam>>
			| (() => NonUndefinedGuard<InfiniteData<TQueryFnData, TPageParam>>)
	}
>

/* ============================================================================
 * infiniteQueryOptions
 * ============================================================================ */

export function infiniteQueryOptions<
	TQueryFnData,
	TError = DefaultError,
	TData = InfiniteData<TQueryFnData>,
	TQueryKey extends QueryKey = QueryKey,
	TPageParam = unknown,
>(
	options: ReturnType<
		DefinedInitialDataInfiniteOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>
	>,
): ReturnType<
	DefinedInitialDataInfiniteOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>
> & {
	queryKey: DataTag<TQueryKey, InfiniteData<TQueryFnData>>
}

export function infiniteQueryOptions<
	TQueryFnData,
	TError = DefaultError,
	TData = InfiniteData<TQueryFnData>,
	TQueryKey extends QueryKey = QueryKey,
	TPageParam = unknown,
>(
	options: ReturnType<
		UndefinedInitialDataInfiniteOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>
	>,
): ReturnType<
	UndefinedInitialDataInfiniteOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>
> & {
	queryKey: DataTag<TQueryKey, InfiniteData<TQueryFnData>>
}

export function infiniteQueryOptions(options: unknown) {
	return options
}
