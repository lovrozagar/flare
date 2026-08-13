/**
 * Flare useSuspenseQuery - Solid-based TanStack Query with Suspense
 *
 * Throws promises during loading to integrate with Suspense boundaries.
 * Data is guaranteed to be defined after Suspense resolves.
 *
 * @example
 * ```tsx
 * import { Suspense } from "solid-js"
 *
 * function UserProfile() {
 *   const query = useSuspenseQuery(() => ({
 *     queryKey: ["user", userId],
 *     queryFn: () => fetch(`/api/users/${userId}`).then(r => r.json())
 *   }))
 *
 *   // data() is guaranteed to be defined - no undefined check needed
 *   return <div>{query.data().name}</div>
 * }
 *
 * // Wrap in Suspense boundary
 * <Suspense fallback={<Loading />}>
 *   <UserProfile />
 * </Suspense>
 * ```
 */

import {
	type DefaultError,
	type QueryClient,
	type QueryKey,
	QueryObserver,
	type QueryObserverOptions,
	type QueryObserverResult,
} from "@tanstack/query-core"
import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { useQueryClient } from "../query-client-provider"

/* ============================================================================
 * Types
 * ============================================================================ */

export type UseSuspenseQueryOptions<
	TQueryFnData = unknown,
	TError = DefaultError,
	TData = TQueryFnData,
	TQueryKey extends QueryKey = QueryKey,
> = Omit<
	QueryObserverOptions<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>,
	"enabled" | "placeholderData" | "throwOnError"
>

export type UseSuspenseQueryResult<TData = unknown, TError = DefaultError> = {
	/** The resolved data - guaranteed to be defined */
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
	/** Fetch status: 'fetching' | 'paused' | 'idle' */
	fetchStatus: () => "fetching" | "idle" | "paused"
	/** True if query errored */
	isError: () => boolean
	/** True if currently fetching (initial or background) */
	isFetching: () => boolean
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
	refetch: () => Promise<QueryObserverResult<TData, TError>>
	/** Query status: 'pending' | 'error' | 'success' */
	status: () => "error" | "pending" | "success"
}

/* ============================================================================
 * useSuspenseQuery
 * ============================================================================ */

/**
 * Create a reactive query that throws during loading for Suspense integration
 *
 * @param options - Accessor function returning query options (reactive)
 * @param queryClient - Optional QueryClient (uses context if not provided)
 */
export function useSuspenseQuery<
	TQueryFnData = unknown,
	TError = DefaultError,
	TData = TQueryFnData,
	TQueryKey extends QueryKey = QueryKey,
>(
	options: () => UseSuspenseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
	queryClient?: QueryClient,
): UseSuspenseQueryResult<TData, TError> {
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
		}) as QueryObserverOptions<TQueryFnData, TError, TData, TQueryFnData, TQueryKey> & {
			queryKey: TQueryKey
		}
	})

	/* Create observer - manages query lifecycle */
	const observer = new QueryObserver<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>(
		client,
		defaultedOptions(),
	)

	/* Store query result state */
	const [state, setState] = createSignal<QueryObserverResult<TData, TError>>(
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
		fetchStatus: () => state().fetchStatus,
		isError: () => state().isError,
		isFetching: () => state().isFetching,
		isPaused: () => state().isPaused,
		isRefetchError: () => state().isRefetchError,
		isRefetching: () => state().isRefetching,
		isStale: () => state().isStale,
		isSuccess: () => state().isSuccess,
		refetch: () => observer.refetch(),
		status: () => state().status,
	}
}
