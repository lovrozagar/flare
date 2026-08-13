/**
 * useQueries - Run multiple queries in parallel
 *
 * Allows running multiple queries with a single hook call,
 * useful when the number of queries is dynamic.
 *
 * @example
 * ```tsx
 * const queries = useQueries(() => ({
 *   queries: userIds.map(id => ({
 *     queryKey: ["user", id],
 *     queryFn: () => fetchUser(id),
 *   })),
 * }))
 *
 * <For each={queries}>
 *   {query => <Show when={query.data}>{user => <UserCard user={user()} />}</Show>}
 * </For>
 * ```
 */

import type {
	DefaultError,
	OmitKeyof,
	QueriesObserverOptions,
	QueriesPlaceholderDataFunction,
	QueryFunction,
	QueryKey,
	QueryObserverOptions,
	QueryObserverResult,
	ThrowOnError,
} from "@tanstack/query-core"
import { noop, QueriesObserver } from "@tanstack/query-core"
import type { Accessor } from "solid-js"
import {
	batch,
	createComputed,
	createMemo,
	createRenderEffect,
	createResource,
	mergeProps,
	on,
	onCleanup,
	onMount,
} from "solid-js"
import { createStore, unwrap } from "solid-js/store"
import { useIsRestoring } from "../is-restoring/index"
import type { QueryClient } from "../query-client/index"
import { useQueryClient } from "../query-client-provider/index"
import type { SolidQueryOptions, UseQueryResult } from "../types/index"

/* ============================================================================
 * Types
 * ============================================================================ */

type UseQueryOptionsForUseQueries<
	TQueryFnData = unknown,
	TError = DefaultError,
	TData = TQueryFnData,
	TQueryKey extends QueryKey = QueryKey,
> = OmitKeyof<SolidQueryOptions<TQueryFnData, TError, TData, TQueryKey>, "placeholderData"> & {
	placeholderData?: TQueryFnData | QueriesPlaceholderDataFunction<TQueryFnData>
}

/* Avoid TS depth-limit error in case of large array literal */
type MAXIMUM_DEPTH = 20

/* Widen the type of the symbol to enable type inference even if skipToken is not immutable. */
type SkipTokenForUseQueries = symbol

type GetOptions<T> = T extends {
	queryFnData: infer TQueryFnData
	error?: infer TError
	data: infer TData
}
	? UseQueryOptionsForUseQueries<TQueryFnData, TError, TData>
	: T extends { queryFnData: infer TQueryFnData; error?: infer TError }
		? UseQueryOptionsForUseQueries<TQueryFnData, TError>
		: T extends { data: infer TData; error?: infer TError }
			? UseQueryOptionsForUseQueries<unknown, TError, TData>
			: T extends [infer TQueryFnData, infer TError, infer TData]
				? UseQueryOptionsForUseQueries<TQueryFnData, TError, TData>
				: T extends [infer TQueryFnData, infer TError]
					? UseQueryOptionsForUseQueries<TQueryFnData, TError>
					: T extends [infer TQueryFnData]
						? UseQueryOptionsForUseQueries<TQueryFnData>
						: T extends {
									queryFn?:
										| QueryFunction<infer TQueryFnData, infer TQueryKey>
										| SkipTokenForUseQueries
									select?: (data: any) => infer TData
									throwOnError?: ThrowOnError<any, infer TError, any, any>
							  }
							? UseQueryOptionsForUseQueries<
									TQueryFnData,
									unknown extends TError ? DefaultError : TError,
									unknown extends TData ? TQueryFnData : TData,
									TQueryKey
								>
							: UseQueryOptionsForUseQueries

type GetResults<T> = T extends { queryFnData: unknown; error?: infer TError; data: infer TData }
	? UseQueryResult<TData, TError>
	: T extends { queryFnData: infer TQueryFnData; error?: infer TError }
		? UseQueryResult<TQueryFnData, TError>
		: T extends { data: infer TData; error?: infer TError }
			? UseQueryResult<TData, TError>
			: T extends [unknown, infer TError, infer TData]
				? UseQueryResult<TData, TError>
				: T extends [infer TQueryFnData, infer TError]
					? UseQueryResult<TQueryFnData, TError>
					: T extends [infer TQueryFnData]
						? UseQueryResult<TQueryFnData>
						: T extends {
									queryFn?: QueryFunction<infer TQueryFnData, any> | SkipTokenForUseQueries
									select?: (data: any) => infer TData
									throwOnError?: ThrowOnError<any, infer TError, any, any>
							  }
							? UseQueryResult<
									unknown extends TData ? TQueryFnData : TData,
									unknown extends TError ? DefaultError : TError
								>
							: UseQueryResult

/**
 * QueriesOptions reducer recursively unwraps function arguments to infer/enforce type param
 */
type QueriesOptions<
	T extends Array<any>,
	TResult extends Array<any> = [],
	TDepth extends ReadonlyArray<number> = [],
> = TDepth["length"] extends MAXIMUM_DEPTH
	? Array<UseQueryOptionsForUseQueries>
	: T extends []
		? []
		: T extends [infer Head]
			? [...TResult, GetOptions<Head>]
			: T extends [infer Head, ...infer Tail]
				? QueriesOptions<[...Tail], [...TResult, GetOptions<Head>], [...TDepth, 1]>
				: ReadonlyArray<unknown> extends T
					? T
					: T extends Array<
								UseQueryOptionsForUseQueries<
									infer TQueryFnData,
									infer TError,
									infer TData,
									infer TQueryKey
								>
						  >
						? Array<UseQueryOptionsForUseQueries<TQueryFnData, TError, TData, TQueryKey>>
						: Array<UseQueryOptionsForUseQueries>

/**
 * QueriesResults reducer recursively maps type param to results
 */
type QueriesResults<
	T extends Array<any>,
	TResult extends Array<any> = [],
	TDepth extends ReadonlyArray<number> = [],
> = TDepth["length"] extends MAXIMUM_DEPTH
	? Array<UseQueryResult>
	: T extends []
		? []
		: T extends [infer Head]
			? [...TResult, GetResults<Head>]
			: T extends [infer Head, ...infer Tail]
				? QueriesResults<[...Tail], [...TResult, GetResults<Head>], [...TDepth, 1]>
				: { [K in keyof T]: GetResults<T[K]> }

/* ============================================================================
 * useQueries
 * ============================================================================ */

export function useQueries<
	T extends Array<any>,
	TCombinedResult extends QueriesResults<T> = QueriesResults<T>,
>(
	queriesOptions: Accessor<{
		queries: readonly [...QueriesOptions<T>] | readonly [...{ [K in keyof T]: GetOptions<T[K]> }]
		combine?: (result: QueriesResults<T>) => TCombinedResult
	}>,
	queryClient?: Accessor<QueryClient>,
): TCombinedResult {
	const client = createMemo(() => queryClient?.() ?? useQueryClient())
	const isRestoring = useIsRestoring()

	const defaultedQueries = createMemo(() =>
		queriesOptions().queries.map((options) =>
			mergeProps(client().defaultQueryOptions(options as QueryObserverOptions), {
				get _optimisticResults() {
					return isRestoring() ? "isRestoring" : "optimistic"
				},
			}),
		),
	)

	const observer = new QueriesObserver(
		client(),
		defaultedQueries(),
		queriesOptions().combine
			? ({
					combine: queriesOptions().combine,
				} as QueriesObserverOptions<TCombinedResult>)
			: undefined,
	)

	const [state, setState] = createStore<TCombinedResult>(
		observer.getOptimisticResult(
			defaultedQueries(),
			(queriesOptions() as QueriesObserverOptions<TCombinedResult>).combine,
		)[1](),
	)

	createRenderEffect(
		on(
			() => queriesOptions().queries.length,
			() =>
				setState(
					observer.getOptimisticResult(
						defaultedQueries(),
						(queriesOptions() as QueriesObserverOptions<TCombinedResult>).combine,
					)[1](),
				),
		),
	)

	const dataResources = createMemo(
		on(
			() => state.length,
			() =>
				state.map((queryRes) => {
					const dataPromise = () =>
						new Promise((resolve) => {
							if (queryRes.isFetching && queryRes.isLoading) return
							resolve(unwrap(queryRes.data))
						})
					return createResource(dataPromise)
				}),
		),
	)

	batch(() => {
		const dataResources_ = dataResources()
		for (let index = 0; index < dataResources_.length; index++) {
			const dataResource = dataResources_[index]
			if (dataResource) {
				dataResource[1].mutate(() => unwrap(state[index]?.data))
				dataResource[1].refetch()
			}
		}
	})

	let taskQueue: Array<() => void> = []
	const subscribeToObserver = () =>
		observer.subscribe((result) => {
			taskQueue.push(() => {
				batch(() => {
					const dataResources_ = dataResources()
					for (let index = 0; index < dataResources_.length; index++) {
						const dataResource = dataResources_[index]
						if (!dataResource) continue
						const unwrappedResult = { ...unwrap(result[index]) }
						/* @ts-expect-error typescript pedantry regarding the possible range of index */
						setState(index, unwrap(unwrappedResult))
						dataResource[1].mutate(() => unwrap(state[index]?.data))
						dataResource[1].refetch()
					}
				})
			})

			queueMicrotask(() => {
				const taskToRun = taskQueue.pop()
				if (taskToRun) taskToRun()
				taskQueue = []
			})
		})

	let unsubscribe: () => void = noop
	createComputed<() => void>((cleanup) => {
		cleanup?.()
		unsubscribe = isRestoring() ? noop : subscribeToObserver()
		/* cleanup needs to be scheduled after synchronous effects take place */
		return () => queueMicrotask(unsubscribe)
	})
	onCleanup(unsubscribe)

	onMount(() => {
		observer.setQueries(
			defaultedQueries(),
			queriesOptions().combine
				? ({
						combine: queriesOptions().combine,
					} as QueriesObserverOptions<TCombinedResult>)
				: undefined,
		)
	})

	createComputed(() => {
		observer.setQueries(
			defaultedQueries(),
			queriesOptions().combine
				? ({
						combine: queriesOptions().combine,
					} as QueriesObserverOptions<TCombinedResult>)
				: undefined,
		)
	})

	const handler = (index: number) => ({
		get(target: QueryObserverResult, prop: keyof QueryObserverResult): unknown {
			if (prop === "data") {
				const resource = dataResources()[index]
				return resource ? resource[0]() : undefined
			}
			return Reflect.get(target, prop)
		},
	})

	const getProxies = () =>
		state.map((s, index) => {
			return new Proxy(s, handler(index))
		})

	const [proxyState, setProxyState] = createStore(getProxies())
	createRenderEffect(() => setProxyState(getProxies()))

	return proxyState as TCombinedResult
}
