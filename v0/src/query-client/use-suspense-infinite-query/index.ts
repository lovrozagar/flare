/**
 * Flare useSuspenseInfiniteQuery - Solid-based TanStack Infinite Query with Suspense
 *
 * Throws promises during loading to integrate with Suspense boundaries.
 * Data is guaranteed to be defined after Suspense resolves.
 *
 * @example
 * ```tsx
 * import { Suspense, For } from "solid-js"
 *
 * function PostList() {
 *   const query = useSuspenseInfiniteQuery(() => ({
 *     queryKey: ["posts"],
 *     queryFn: ({ pageParam }) => fetch(`/api/posts?page=${pageParam}`).then(r => r.json()),
 *     initialPageParam: 1,
 *     getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
 *   }))
 *
 *   // data() is guaranteed to be defined - no undefined check needed
 *   return (
 *     <For each={query.data().pages}>
 *       {(page) => <For each={page.posts}>{(post) => <PostCard post={post} />}</For>}
 *     </For>
 *   )
 * }
 *
 * // Wrap in Suspense boundary
 * <Suspense fallback={<Loading />}>
 *   <PostList />
 * </Suspense>
 * ```
 */

import {
	type DefaultError,
	type InfiniteData,
	InfiniteQueryObserver,
	type InfiniteQueryObserverOptions,
	type InfiniteQueryObserverResult,
	type QueryClient,
	type QueryKey,
} from "@tanstack/query-core"
import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { useQueryClient } from "../query-client-provider"

/* ============================================================================
 * Types
 * ============================================================================ */

export type UseSuspenseInfiniteQueryOptions<
	TQueryFnData = unknown,
	TError = DefaultError,
	TData = InfiniteData<TQueryFnData>,
	TQueryKey extends QueryKey = QueryKey,
	TPageParam = unknown,
> = Omit<
	InfiniteQueryObserverOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>,
	"enabled" | "placeholderData" | "throwOnError"
>

export type UseSuspenseInfiniteQueryResult<TData = unknown, TError = DefaultError> = {
	/** The resolved data (pages array) - guaranteed to be defined */
	data: () => TData
	/** The current data update count */
	dataUpdatedAt: () => number
	/** Error if query failed (thrown, but available for error boundaries) */
	error: () => TError | null
	/** Timestamp of last error */
	errorUpdatedAt: () => number
	/** Number of times query has failed */
	failureCount: () => number
	/** Reason for last failure */
	failureReason: () => TError | null
	/** Fetch the next page */
	fetchNextPage: () => Promise<InfiniteQueryObserverResult<TData, TError>>
	/** Fetch the previous page */
	fetchPreviousPage: () => Promise<InfiniteQueryObserverResult<TData, TError>>
	/** Fetch status: 'fetching' | 'paused' | 'idle' */
	fetchStatus: () => "fetching" | "idle" | "paused"
	/** True if there's a next page available */
	hasNextPage: () => boolean
	/** True if there's a previous page available */
	hasPreviousPage: () => boolean
	/** True if query errored */
	isError: () => boolean
	/** True if currently fetching (initial or background) */
	isFetching: () => boolean
	/** True if currently fetching next page */
	isFetchingNextPage: () => boolean
	/** True if currently fetching previous page */
	isFetchingPreviousPage: () => boolean
	/** True if fetch is paused */
	isPaused: () => boolean
	/** True if refetching with existing data */
	isRefetchError: () => boolean
	/** True if fetching in background (have data) */
	isRefetching: () => boolean
	/** True if data was previously fetched and is stale */
	isStale: () => boolean
	/** True if query succeeded */
	isSuccess: () => boolean
	/** Manually refetch the query */
	refetch: () => Promise<InfiniteQueryObserverResult<TData, TError>>
	/** Query status: 'pending' | 'error' | 'success' */
	status: () => "error" | "pending" | "success"
}

/* ============================================================================
 * useSuspenseInfiniteQuery
 * ============================================================================ */

/**
 * Create a reactive infinite query that throws during loading for Suspense integration
 *
 * @param options - Accessor function returning query options (reactive)
 * @param queryClient - Optional QueryClient (uses context if not provided)
 */
export function useSuspenseInfiniteQuery<
	TQueryFnData = unknown,
	TError = DefaultError,
	TData = InfiniteData<TQueryFnData>,
	TQueryKey extends QueryKey = QueryKey,
	TPageParam = unknown,
>(
	options: () => UseSuspenseInfiniteQueryOptions<
		TQueryFnData,
		TError,
		TData,
		TQueryKey,
		TPageParam
	>,
	queryClient?: QueryClient,
): UseSuspenseInfiniteQueryResult<TData, TError> {
	const client = queryClient ?? useQueryClient()

	/* Memoize defaulted options - tracks reactive dependencies */
	const defaultedOptions = createMemo(() => {
		const opts = options()
		return client.defaultQueryOptions({
			...opts,
			/* Suspense queries are always enabled and throw on error */
			enabled: true,
			suspense: true,
			throwOnError: true,
		} as InfiniteQueryObserverOptions<
			TQueryFnData,
			TError,
			TData,
			TQueryKey,
			TPageParam
		>) as InfiniteQueryObserverOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam> & {
			queryKey: TQueryKey
		}
	})

	/* Create observer - manages query lifecycle */
	const observer = new InfiniteQueryObserver<TQueryFnData, TError, TData, TQueryKey, TPageParam>(
		client,
		defaultedOptions(),
	)

	/* Store query result state */
	const [state, setState] = createSignal<InfiniteQueryObserverResult<TData, TError>>(
		observer.getCurrentResult(),
	)

	/* Subscribe to observer updates and sync options */
	createEffect(() => {
		const opts = defaultedOptions()
		observer.setOptions(opts)

		const unsubscribe = observer.subscribe((result) => {
			setState(() => result)
		})

		onCleanup(unsubscribe)
	})

	/* Create result object with Suspense throw logic in data accessor */
	return {
		data: () => {
			const result = state()

			/* If loading, throw promise for Suspense */
			if (result.isLoading) {
				throw observer.fetchOptimistic(defaultedOptions())
			}

			/* If error, throw it for error boundary */
			if (result.isError) {
				throw result.error
			}

			/* Data is guaranteed to be defined here */
			return result.data as TData
		},
		dataUpdatedAt: () => state().dataUpdatedAt,
		error: () => state().error,
		errorUpdatedAt: () => state().errorUpdatedAt,
		failureCount: () => state().failureCount,
		failureReason: () => state().failureReason,
		fetchNextPage: () => observer.fetchNextPage(),
		fetchPreviousPage: () => observer.fetchPreviousPage(),
		fetchStatus: () => state().fetchStatus,
		hasNextPage: () => state().hasNextPage,
		hasPreviousPage: () => state().hasPreviousPage,
		isError: () => state().isError,
		isFetching: () => state().isFetching,
		isFetchingNextPage: () => state().isFetchingNextPage,
		isFetchingPreviousPage: () => state().isFetchingPreviousPage,
		isPaused: () => state().isPaused,
		isRefetchError: () => state().isRefetchError,
		isRefetching: () => state().isRefetching,
		isStale: () => state().isStale,
		isSuccess: () => state().isSuccess,
		refetch: () => observer.refetch() as Promise<InfiniteQueryObserverResult<TData, TError>>,
		status: () => state().status,
	}
}
