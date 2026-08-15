import { QueryClient, QueryClientProvider, type QueryKey, useQuery } from "@tanstack/solid-query";
import type { Accessor } from "solid-js";

export { QueryClientProvider };

/* ── useSuspenseQuery ────────────────────────────────────────────────── */

export interface UseSuspenseQueryOptions<TData = unknown, _TError = Error, TQueryKey extends QueryKey = QueryKey> {
	queryFn: (context: { queryKey: TQueryKey; signal: AbortSignal }) => TData | Promise<TData>;
	queryKey: Accessor<TQueryKey> | TQueryKey;
	staleTime?: number;
}

export interface UseSuspenseQueryResult<TData = unknown, TError = Error> {
	data: Accessor<TData | undefined>;
	dataUpdatedAt: Accessor<number>;
	error: Accessor<TError | null>;
	errorUpdatedAt: Accessor<number>;
	failureCount: Accessor<number>;
	failureReason: Accessor<TError | null>;
	fetchStatus: Accessor<string>;
	isError: Accessor<boolean>;
	isFetched: Accessor<boolean>;
	isFetchedAfterMount: Accessor<boolean>;
	isFetching: Accessor<boolean>;
	isLoading: Accessor<boolean>;
	isPaused: Accessor<boolean>;
	isPlaceholderData: Accessor<boolean>;
	isRefetchError: Accessor<boolean>;
	isRefetching: Accessor<boolean>;
	isStale: Accessor<boolean>;
	isSuccess: Accessor<boolean>;
	refetch: () => Promise<unknown>;
	status: Accessor<"success">;
}

function resolveQueryKey<T extends QueryKey>(v: Accessor<T> | T): T {
	return Array.isArray(v) ? v : (v as Accessor<T>)();
}

/**
 * Thin wrapper over TanStack's `useQuery` with suspense semantics.
 * Delegates entirely to TanStack's SSR-aware implementation which uses
 * `createResource` for proper Solid SSR streaming integration.
 */
export function useSuspenseQuery<TData = unknown, TError = Error, TQueryKey extends QueryKey = QueryKey>(
	options: UseSuspenseQueryOptions<TData, TError, TQueryKey>,
): UseSuspenseQueryResult<TData, TError> {
	const result = useQuery(() => ({
		enabled: true,
		queryFn: options.queryFn as (context: { queryKey: QueryKey; signal: AbortSignal }) => TData | Promise<TData>,
		queryKey: resolveQueryKey(options.queryKey),
		staleTime: options.staleTime,
		throwOnError: true,
	}));

	return {
		data: () => result.data as TData,
		dataUpdatedAt: () => result.dataUpdatedAt,
		error: () => result.error as TError | null,
		errorUpdatedAt: () => result.errorUpdatedAt,
		failureCount: () => result.failureCount,
		failureReason: () => result.failureReason as TError | null,
		fetchStatus: () => result.fetchStatus,
		isError: () => result.isError,
		isFetched: () => result.isFetched,
		isFetchedAfterMount: () => result.isFetchedAfterMount,
		isFetching: () => result.isFetching,
		isLoading: () => result.isLoading,
		isPaused: () => result.isPaused,
		isPlaceholderData: () => result.isPlaceholderData,
		isRefetchError: () => result.isRefetchError,
		isRefetching: () => result.isRefetching,
		isStale: () => result.isStale,
		isSuccess: () => result.isSuccess,
		refetch: () => result.refetch(),
		status: () => "success" as const,
	};
}

/* ── createQueryClientGetter (per-request on server, singleton on client) */

export interface QueryClientGetterOptions {
	broadcast?: boolean | string;
	defaultOptions?: {
		mutations?: { gcTime?: number; retry?: boolean | number };
		queries?: { gcTime?: number; retry?: boolean | number; staleTime?: number };
	};
}

export function createQueryClientGetter(options?: QueryClientGetterOptions): () => QueryClient {
	let clientInstance: QueryClient | undefined;
	return () => {
		if (typeof window === "undefined") {
			return new QueryClient(options);
		}
		if (!clientInstance) {
			clientInstance = new QueryClient(options);
			if (options?.broadcast) {
				const channelName = typeof options.broadcast === "string" ? options.broadcast : "flare:qc";
				import("@tanstack/query-broadcast-client-experimental")
					.then(({ broadcastQueryClient }) => {
						broadcastQueryClient({
							broadcastChannel: channelName,
							queryClient: clientInstance as QueryClient,
						});
					})
					.catch(() => {});
			}
		}
		return clientInstance;
	};
}

/* ── createTrackedQueryClient (SSR query tracking) ───────────────────── */

export interface QueryState {
	data: unknown;
	key: unknown[];
	staleTime?: number;
}

export interface TrackedQueryClient {
	client: QueryClient;
	drain(): QueryState[];
	getTrackedQueries(): QueryState[];
}

export function createTrackedQueryClient(client: QueryClient): TrackedQueryClient {
	const tracked: QueryState[] = [];

	const originalSetQueryData = client.setQueryData.bind(client);
	/* TS 7: QueryClient.setQueryData identities from query-core vs solid-query do not unify. */
	client.setQueryData = ((...args: Parameters<QueryClient["setQueryData"]>) => {
		const result = originalSetQueryData(...args);

		const defaults = client.getQueryDefaults(args[0]);
		const rawStaleTime = defaults?.staleTime;
		tracked.push({
			data: result,
			key: [...args[0]],
			staleTime: typeof rawStaleTime === "number" ? rawStaleTime : undefined,
		});

		return result;
	}) as QueryClient["setQueryData"];

	return {
		client,
		drain: () => tracked.splice(0),
		getTrackedQueries: () => tracked,
	};
}

/* ── hydrateQueryCache (client-side query hydration) ─────────────────── */

export function hydrateQueryCache(client: QueryClient, queries: QueryState[]): void {
	for (const entry of queries) {
		if (!Array.isArray(entry.key)) continue;
		const key = entry.key as QueryKey;
		client.setQueryData(key, entry.data);
		if (entry.staleTime !== undefined && entry.staleTime !== null) {
			client.setQueryDefaults(key, { staleTime: entry.staleTime });
		}
	}
}
