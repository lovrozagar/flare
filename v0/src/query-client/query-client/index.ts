/**
 * Extended QueryClient for Solid/Flare
 *
 * Extends the core QueryClient with Solid-specific options like `reconcile`.
 */

import {
	type DefaultOptions as CoreDefaultOptions,
	type DefaultError,
	type OmitKeyof,
	QueryClient as QueryCoreClient,
	type QueryClientConfig as QueryCoreClientConfig,
	type InfiniteQueryObserverOptions as QueryCoreInfiniteQueryObserverOptions,
	type QueryObserverOptions as QueryCoreObserverOptions,
	type QueryKey,
} from "@tanstack/query-core"

/* ============================================================================
 * Extended Observer Options (with reconcile)
 * ============================================================================ */

export interface QueryObserverOptions<
	TQueryFnData = unknown,
	TError = DefaultError,
	TData = TQueryFnData,
	TQueryData = TQueryFnData,
	TQueryKey extends QueryKey = QueryKey,
	TPageParam = never,
> extends OmitKeyof<
	QueryCoreObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey, TPageParam>,
	"structuralSharing"
> {
	/**
	 * Set this to a reconciliation key to enable reconciliation between query results.
	 * Set this to `false` to disable reconciliation between query results.
	 * Set this to a function which accepts the old and new data and returns resolved data of the same type to implement custom reconciliation logic.
	 * Defaults reconciliation to false.
	 */
	reconcile?: string | false | ((oldData: TData | undefined, newData: TData) => TData)
}

export interface InfiniteQueryObserverOptions<
	TQueryFnData = unknown,
	TError = DefaultError,
	TData = TQueryFnData,
	TQueryKey extends QueryKey = QueryKey,
	TPageParam = unknown,
> extends OmitKeyof<
	QueryCoreInfiniteQueryObserverOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>,
	"structuralSharing"
> {
	/**
	 * Set this to a reconciliation key to enable reconciliation between query results.
	 * Set this to `false` to disable reconciliation between query results.
	 * Set this to a function which accepts the old and new data and returns resolved data of the same type to implement custom reconciliation logic.
	 * Defaults reconciliation to false.
	 */
	reconcile?: string | false | ((oldData: TData | undefined, newData: TData) => TData)
}

/* ============================================================================
 * Extended Default Options
 * ============================================================================ */

export interface DefaultOptions<TError = DefaultError> extends CoreDefaultOptions<TError> {
	queries?: OmitKeyof<QueryObserverOptions<unknown, TError>, "queryKey">
}

/* ============================================================================
 * Extended QueryClient Config
 * ============================================================================ */

export interface QueryClientConfig extends QueryCoreClientConfig {
	defaultOptions?: DefaultOptions
}

/* ============================================================================
 * Extended QueryClient
 * ============================================================================ */

export class QueryClient extends QueryCoreClient {
	constructor(config: QueryClientConfig = {}) {
		super(config)
	}
}
