/**
 * useBaseQuery - Core query hook with SSR/hydration support
 *
 * This is the base implementation used by useQuery and useInfiniteQuery.
 * Based on TanStack Solid Query with Flare adaptations.
 */

import type { Query, QueryKey, QueryObserver, QueryObserverResult } from "@tanstack/query-core"
import { hydrate, notifyManager, shouldThrowError } from "@tanstack/query-core"
import type { Accessor, Signal } from "solid-js"
import { createComputed, createMemo, createResource, createSignal, on, onCleanup } from "solid-js"
import { createStore, reconcile, unwrap } from "solid-js/store"
import { isServer } from "solid-js/web"
import { useIsRestoring } from "../is-restoring/index"
import type { QueryClient } from "../query-client/index"
import { useQueryClient } from "../query-client-provider/index"
import type { UseBaseQueryOptions } from "../types/index"

/* ============================================================================
 * Reconciliation Helper
 * ============================================================================ */

function reconcileFn<TData, TError>(
	store: QueryObserverResult<TData, TError>,
	result: QueryObserverResult<TData, TError>,
	reconcileOption: string | false | ((oldData: TData | undefined, newData: TData) => TData),
	queryHash?: string,
): QueryObserverResult<TData, TError> {
	if (reconcileOption === false) return result
	if (typeof reconcileOption === "function") {
		const newData = reconcileOption(store.data, result.data as TData)
		return { ...result, data: newData } as typeof result
	}
	let data = result.data
	if (store.data === undefined) {
		try {
			data = structuredClone(data)
		} catch (error) {
			if (process.env.NODE_ENV !== "production") {
				if (error instanceof Error) {
					console.warn(
						`Unable to correctly reconcile data for query key: ${queryHash}. ` +
							`Possibly because the query data contains data structures that aren't supported ` +
							`by the 'structuredClone' algorithm. Consider using a callback function instead ` +
							`to manage the reconciliation manually.\n\n Error Received: ${error.name} - ${error.message}`,
					)
				}
			}
		}
	}
	const newData = reconcile(data, { key: reconcileOption })(store.data)
	return { ...result, data: newData } as typeof result
}

/* ============================================================================
 * Hydratable Result Helper
 * ============================================================================ */

/**
 * Solid's `onHydrated` functionality will silently "fail" (hydrate with an empty object)
 * if the resource data is not serializable.
 */
const hydratableObserverResult = <
	TQueryFnData,
	TError,
	TData,
	TQueryKey extends QueryKey,
	TDataHydratable,
>(
	query: Query<TQueryFnData, TError, TData, TQueryKey>,
	result: QueryObserverResult<TDataHydratable, TError>,
) => {
	if (!isServer) return result
	const obj: Record<string, unknown> = {
		...unwrap(result),
		/* During SSR, functions cannot be serialized, so we need to remove them */
		/* This is safe because we will add these functions back when the query is hydrated */
		refetch: undefined,
	}

	/* If the query is an infinite query, we need to remove additional properties */
	if ("fetchNextPage" in result) {
		obj.fetchNextPage = undefined
		obj.fetchPreviousPage = undefined
	}

	/* We will also attach the dehydrated state of the query to the result */
	/* This will be removed on client after hydration */
	obj.hydrationData = {
		queryHash: query.queryHash,
		queryKey: query.queryKey,
		state: query.state,
		...(query.meta && { meta: query.meta }),
	}

	return obj
}

/* ============================================================================
 * useBaseQuery
 * ============================================================================ */

export function useBaseQuery<TQueryFnData, TError, TData, TQueryData, TQueryKey extends QueryKey>(
	options: Accessor<UseBaseQueryOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>>,
	Observer: typeof QueryObserver,
	queryClient?: Accessor<QueryClient>,
) {
	type ResourceData = QueryObserverResult<TData, TError>

	const client = createMemo(() => queryClient?.() ?? useQueryClient())
	const isRestoring = useIsRestoring()
	/* There are times when we run a query on the server but the resource is never read */
	/* This could lead to times when the queryObserver is unsubscribed before the resource has loaded */
	/* Causing a time out error. To prevent this we will queue the unsubscribe if the cleanup is called */
	/* before the resource has loaded */
	let unsubscribeQueued = false

	const defaultedOptions = createMemo(() => {
		const defaultOptions = client().defaultQueryOptions(options())
		defaultOptions._optimisticResults = isRestoring() ? "isRestoring" : "optimistic"
		defaultOptions.structuralSharing = false
		if (isServer) {
			defaultOptions.retry = false
			defaultOptions.throwOnError = true
			/* Enable prefetch during render for SSR - required for createResource to work */
			/* Without this, queries wait for effects which never run on the server */
			defaultOptions.experimental_prefetchInRender = true
		}
		return defaultOptions
	})
	const initialOptions = defaultedOptions()

	const [observer, setObserver] = createSignal(new Observer(client(), defaultedOptions()))

	let observerResult = observer().getOptimisticResult(defaultedOptions())
	const [state, setState] = createStore<QueryObserverResult<TData, TError>>(observerResult)

	const createServerSubscriber = (
		resolve: (data: ResourceData | PromiseLike<ResourceData | undefined> | undefined) => void,
		reject: (reason?: unknown) => void,
	) => {
		return observer().subscribe((result) => {
			notifyManager.batchCalls(() => {
				const query = observer().getCurrentQuery()
				const unwrappedResult = hydratableObserverResult(query, result)

				if (result.data !== undefined && unwrappedResult.isError) {
					reject(unwrappedResult.error)
					unsubscribeIfQueued()
				} else {
					resolve(unwrappedResult as ResourceData)
					unsubscribeIfQueued()
				}
			})()
		})
	}

	const unsubscribeIfQueued = () => {
		if (unsubscribeQueued) {
			unsubscribe?.()
			unsubscribeQueued = false
		}
	}

	const createClientSubscriber = () => {
		const obs = observer()
		return obs.subscribe((result) => {
			observerResult = result
			queueMicrotask(() => {
				if (unsubscribe) {
					refetch()
				}
			})
		})
	}

	function setStateWithReconciliation(res: typeof observerResult) {
		const opts = observer().options
		/* @ts-expect-error - Reconcile option is not correctly typed internally */
		const reconcileOptions = opts.reconcile

		setState((store) => {
			return reconcileFn(
				store,
				res,
				reconcileOptions === undefined ? false : reconcileOptions,
				opts.queryHash,
			)
		})
	}

	function createDeepSignal<T>(): Signal<T> {
		return [
			() => state,
			(input: unknown) => {
				const unwrapped = unwrap(state)
				let value = input
				if (typeof value === "function") {
					value = (value as (prev: typeof unwrapped) => unknown)(unwrapped)
				}
				/* Hydration data exists on first load after SSR, */
				/* and should be removed from the observer result */
				if (value && typeof value === "object" && "hydrationData" in value) {
					const { hydrationData: _, ...rest } = value as Record<string, unknown>
					value = rest
				}
				setStateWithReconciliation(value as typeof observerResult)
			},
		] as Signal<T>
	}

	/**
	 * Unsubscribe is set lazily, so that we can subscribe after hydration when needed.
	 */
	let unsubscribe: (() => void) | null = null

	/*
	 * Fixes #7275
	 * In a few cases, the observer could unmount before the resource is loaded.
	 * This leads to Suspense boundaries to be suspended indefinitely.
	 * This resolver will be called when the observer is unmounting
	 * but the resource is still in a loading state
	 */
	let resolver: ((value: ResourceData) => void) | null = null
	const [queryResource, { refetch }] = createResource<ResourceData | undefined>(
		() => {
			const obs = observer()
			return new Promise((resolve, reject) => {
				resolver = resolve
				if (isServer) {
					unsubscribe = createServerSubscriber(resolve, reject)
				} else if (!unsubscribe && !isRestoring()) {
					unsubscribe = createClientSubscriber()
				}
				obs.updateResult()

				if (
					observerResult.isError &&
					!observerResult.isFetching &&
					!isRestoring() &&
					shouldThrowError(obs.options.throwOnError, [observerResult.error, obs.getCurrentQuery()])
				) {
					setStateWithReconciliation(observerResult)
					return reject(observerResult.error)
				}
				if (!observerResult.isLoading) {
					resolver = null
					return resolve(
						hydratableObserverResult(obs.getCurrentQuery(), observerResult) as ResourceData,
					)
				}

				setStateWithReconciliation(observerResult)
			})
		},
		{
			get deferStream() {
				return options().deferStream
			},

			/**
			 * If this resource was populated on the server (either sync render, or streamed in over time), onHydrated
			 * will be called. This is the point at which we can hydrate the query cache state, and setup the query subscriber.
			 *
			 * Leveraging onHydrated allows us to plug into the async and streaming support that solidjs resources already support.
			 *
			 * Note that this is only invoked on the client, for queries that were originally run on the server.
			 */
			onHydrated(_k, info) {
				if (info.value && "hydrationData" in info.value) {
					hydrate(client(), {
						/* @ts-expect-error - hydrationData is not correctly typed internally */
						queries: [{ ...info.value.hydrationData }],
					})
				}

				if (unsubscribe) return
				/**
				 * Do not refetch query on mount if query was fetched on server,
				 * even if `staleTime` is not set.
				 */
				const newOptions = { ...initialOptions }
				if ((initialOptions.staleTime || !initialOptions.initialData) && info.value) {
					newOptions.refetchOnMount = false
				}
				/* Setting the options as an immutable object to prevent */
				/* wonky behavior with observer subscriptions */
				observer().setOptions(newOptions)
				setStateWithReconciliation(observer().getOptimisticResult(newOptions))
				unsubscribe = createClientSubscriber()
			},
			storage: createDeepSignal,
		},
	)

	createComputed(
		on(
			client,
			(c) => {
				if (unsubscribe) {
					unsubscribe()
				}
				const newObserver = new Observer(c, defaultedOptions())
				unsubscribe = createClientSubscriber()
				setObserver(newObserver)
			},
			{
				defer: true,
			},
		),
	)

	createComputed(
		on(
			isRestoring,
			(restoring) => {
				if (!restoring && !isServer) {
					refetch()
				}
			},
			{ defer: true },
		),
	)

	onCleanup(() => {
		if (isServer && queryResource.loading) {
			unsubscribeQueued = true
			return
		}
		if (unsubscribe) {
			unsubscribe()
			unsubscribe = null
		}
		if (resolver && !isServer) {
			resolver(observerResult)
			resolver = null
		}
	})

	createComputed(
		on(
			[observer, defaultedOptions],
			([obs, opts]) => {
				obs.setOptions(opts)
				setStateWithReconciliation(obs.getOptimisticResult(opts))
				refetch()
			},
			{ defer: true },
		),
	)

	const handler = {
		get(
			target: QueryObserverResult<TData, TError>,
			prop: keyof QueryObserverResult<TData, TError>,
		): unknown {
			if (prop === "data") {
				if (state.data !== undefined) {
					return queryResource.latest?.data
				}
				return queryResource()?.data
			}
			return Reflect.get(target, prop)
		},
	}

	return new Proxy(state, handler)
}
