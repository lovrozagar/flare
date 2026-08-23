# Query Client

Layer 4 (client). Depends on solid-js reactivity. Optional — only when `@tanstack/query-core` installed.

Full TanStack Query integration for SolidJS. Reactive query/mutation hooks, SSR streaming support, Loading/Errored integration.

## Types

### Core

```ts
interface TrackedQueryClient<TEnv = unknown> {
	client: QueryClient; /* @tanstack/query-core QueryClient */
	getTrackedQueries(): QueryState[]; /* SSR: returns all queries fetched during render */
}

interface QueryState {
	data: unknown;
	key: unknown[];
	staleTime?: number;
}
```

### Query Options

```ts
interface UseQueryOptions<TData, TError, TQueryKey extends QueryKey> {
	enabled?: Accessor<boolean> | boolean;
	gcTime?: number;
	queryFn: QueryFunction<TData, TQueryKey>;
	queryKey: Accessor<TQueryKey> | TQueryKey;
	select?: (data: TData) => unknown;
	staleTime?: number;
	/* ...all @tanstack/query-core QueryObserverOptions */
}

interface UseSuspenseQueryOptions<TData, TError, TQueryKey extends QueryKey> {
	/* Same as UseQueryOptions minus enabled, placeholderData, throwOnError */
	queryFn: QueryFunction<TData, TQueryKey>;
	queryKey: Accessor<TQueryKey> | TQueryKey;
}

/* deferStream: true → wraps query in Deferred for NDJSON streaming */
interface SolidQueryOptions<TData, TError, TQueryKey extends QueryKey> extends UseQueryOptions<
	TData,
	TError,
	TQueryKey
> {
	deferStream?: boolean;
}
```

### Query Results

```ts
interface UseQueryResult<TData, TError> {
	data: Accessor<TData | undefined>;
	dataUpdatedAt: Accessor<number>;
	error: Accessor<TError | null>;
	errorUpdatedAt: Accessor<number>;
	failureCount: Accessor<number>;
	failureReason: Accessor<TError | null>;
	fetchStatus: Accessor<FetchStatus>;
	isError: Accessor<boolean>;
	isFetched: Accessor<boolean>;
	isFetchedAfterMount: Accessor<boolean>;
	isFetching: Accessor<boolean>;
	isLoading: Accessor<boolean>;
	isPaused: Accessor<boolean>;
	isPending: Accessor<boolean>;
	isPlaceholderData: Accessor<boolean>;
	isRefetchError: Accessor<boolean>;
	isRefetching: Accessor<boolean>;
	isStale: Accessor<boolean>;
	isSuccess: Accessor<boolean>;
	refetch: () => Promise<UseQueryResult<TData, TError>>;
	status: Accessor<QueryStatus>;
}

interface UseSuspenseQueryResult<TData, TError> {
	data: Accessor<TData>; /* guaranteed defined — throws if loading/errored */
	status: Accessor<"success">;
	/* ...rest same as UseQueryResult minus isPending */
}
```

### Mutation

```ts
interface UseMutationOptions<TData, TError, TVariables, TContext> {
	mutationFn: (variables: TVariables) => Promise<TData>;
	mutationKey?: MutationKey;
	onError?: (error: TError, variables: TVariables, context: TContext | undefined) => void;
	onMutate?: (variables: TVariables) => Promise<TContext | undefined> | TContext | undefined;
	onSettled?: (
		data: TData | undefined,
		error: TError | null,
		variables: TVariables,
		context: TContext | undefined,
	) => void;
	onSuccess?: (data: TData, variables: TVariables, context: TContext) => void;
}

interface UseMutationResult<TData, TError, TVariables, TContext> {
	data: Accessor<TData | undefined>;
	error: Accessor<TError | null>;
	isError: Accessor<boolean>;
	isIdle: Accessor<boolean>;
	isPending: Accessor<boolean>;
	isSuccess: Accessor<boolean>;
	mutate: UseMutateFunction<TData, TError, TVariables, TContext>;
	mutateAsync: (variables: TVariables) => Promise<TData>;
	reset: () => void;
	status: Accessor<MutationStatus>;
	variables: Accessor<TVariables | undefined>;
}

type UseMutateFunction<TData, TError, TVariables, TContext> = (
	variables: TVariables,
	options?: MutateOptions<TData, TError, TVariables, TContext>,
) => void;
```

### Infinite Query

```ts
interface UseInfiniteQueryOptions<TData, TError, TQueryKey extends QueryKey, TPageParam> {
	getNextPageParam: (lastPage: TData, allPages: TData[]) => TPageParam | undefined;
	getPreviousPageParam?: (firstPage: TData, allPages: TData[]) => TPageParam | undefined;
	initialPageParam: TPageParam;
	queryFn: QueryFunction<TData, TQueryKey, TPageParam>;
	queryKey: Accessor<TQueryKey> | TQueryKey;
}

interface UseInfiniteQueryResult<TData, TError> extends UseQueryResult<InfiniteData<TData>, TError> {
	fetchNextPage: () => Promise<UseInfiniteQueryResult<TData, TError>>;
	fetchPreviousPage: () => Promise<UseInfiniteQueryResult<TData, TError>>;
	hasNextPage: Accessor<boolean>;
	hasPreviousPage: Accessor<boolean>;
	isFetchingNextPage: Accessor<boolean>;
	isFetchingPreviousPage: Accessor<boolean>;
}
```

## Exports

```ts
/* Hooks */
useQuery<TData, TError>(options: UseQueryOptions<...>): UseQueryResult<...>
useSuspenseQuery<TData, TError>(options: UseSuspenseQueryOptions<...>): UseSuspenseQueryResult<...>
useInfiniteQuery<TData, TError>(options: UseInfiniteQueryOptions<...>): UseInfiniteQueryResult<...>
useSuspenseInfiniteQuery<TData, TError>(options: UseSuspenseInfiniteQueryOptions<...>): UseSuspenseInfiniteQueryResult<...>
useMutation<TData, TError, TVariables>(options: UseMutationOptions<...>): UseMutationResult<...>
useQueries(options: { queries: [...]; combine?: (results) => T }): T | UseQueryResult[]
useIsFetching(filters?: Accessor<QueryFilters>): Accessor<number>
useIsMutating(filters?: Accessor<MutationFilters>): Accessor<number>
useMutationState<TResult>(options?: MutationStateOptions): Accessor<TResult[]>

/* Options builders */
queryOptions<TData, TError, TQueryKey>(options): options & { queryKey: DataTag<...> }
infiniteQueryOptions<TData, TError, TQueryKey>(options): options & { queryKey: DataTag<...> }

/* Provider */
QueryClientProvider: (props: { client: QueryClient; children: JSX.Element }) => JSX.Element

/* Context */
useQueryClient(): QueryClient
IsRestoringProvider: (props: { value: Accessor<boolean>; children: JSX.Element }) => JSX.Element
useIsRestoring(): Accessor<boolean>

/* Server */
createTrackedQueryClient(client: QueryClient): TrackedQueryClient
```

## Behavior

### Reactive Query Subscription

`useQuery` wraps `@tanstack/query-core`'s `QueryObserver` with Solid reactivity:

1. Create `QueryObserver` with resolved options
2. Subscribe to observer via `observer.subscribe()`
3. Map observer results to Solid signals via `createStore`
4. Re-subscribe when reactive `queryKey` or `enabled` changes
5. Cleanup subscription on component unmount

### SSR Streaming Support

`deferStream: true` enables query data streaming via Solid `<Loading>` during SSR.

**SSR behavior**: During `renderToStream`, `useSuspenseQuery` with `deferStream: true` throws the pending promise, which Solid's `<Loading>` catches. Solid keeps the HTML stream open — when the query resolves, Solid inlines the resolved content. This uses Solid's streaming, NOT Flare's NDJSON deferred pipeline.

**CSR behavior**: `deferStream` has no effect during CSR navigation. Queries execute normally during component render via `<Loading>`. The Flare NDJSON defer system (spec 07) operates at the loader level, not the component render level — `deferStream` is an SSR-only streaming optimization.

**Not connected to DeferContext**: Unlike `ctx.defer()` in loaders (spec 07), `deferStream` does not create `DeferContext` entries or NDJSON chunks. It relies entirely on Solid's built-in SSR streaming.

### Loading / Errored Integration

`useSuspenseQuery`:

- During loading: throws promise (Solid `<Loading>` catches it)
- On error: throws error (Solid `<Errored>` catches it)
- On success: `data()` is guaranteed defined (no `undefined`)

Custom implementation (not via `useBaseQuery`):

```ts
const observer = new QueryObserver(client, options);
const [result, setResult] = createSignal(observer.getOptimisticResult(options));

createEffect(() => {
	const r = result();
	if (r.isLoading) throw r.fetchStatus === "fetching" ? r.promise : new Promise(() => {});
	if (r.isError) throw r.error;
});
```

### SSR Tracked Queries

`createTrackedQueryClient` wraps `QueryClient` to track all queries resolved during SSR. After render, `getTrackedQueries()` returns query states for serialization into `FlareState.q`.

On client hydration, tracked queries are restored via `queryClient.setQueryData()` with their `staleTime`.

### `useQueries`

Parallel queries with dynamic count. Uses `QueriesObserver` from query-core.

Batches updates via microtask queue to prevent excessive re-renders when multiple queries resolve simultaneously.

Supports `combine` function for result aggregation.

### `queryOptions` / `infiniteQueryOptions`

Identity functions that add branded `DataTag` to `queryKey` for type inference. Enables type-safe `queryClient.getQueryData(queryOptions.queryKey)`.

## Test Cases

```
useQuery:
  Returns reactive result with data, error, status accessors
  Subscribes to QueryObserver
  Reactive queryKey → re-fetches on change
  Reactive enabled → pauses/resumes
  Unmount → unsubscribes
  staleTime respected
  gcTime respected

useSuspenseQuery:
  Loading → throws promise (Loading catches)
  Error → throws error (Errored catches)
  Success → data() is defined, status() is "success"
  No enabled option (always enabled)
  No placeholderData option

useInfiniteQuery:
  fetchNextPage triggers next page load
  fetchPreviousPage triggers previous page load
  hasNextPage reactive
  getNextPageParam called with last page

useMutation:
  mutate(variables) → fires mutation
  mutateAsync(variables) → returns promise
  onMutate, onSuccess, onError, onSettled callbacks
  isPending during mutation
  isSuccess after success
  isError after error
  reset() clears state

useQueries:
  Multiple queries in parallel
  Dynamic count (reactive array)
  combine function for aggregation
  Batched updates (microtask)

SSR:
  createTrackedQueryClient tracks queries during render
  getTrackedQueries returns serializable states
  Client hydration restores via setQueryData
  SSR query state is serialized as flare.q / __flare_qc (NOT Solid async memos)

queryOptions:
  Returns same options with branded queryKey
  Type inference for getQueryData

useIsFetching:
  Returns count of in-flight queries
  Reactive — updates as queries start/complete

useIsMutating:
  Returns count of in-flight mutations
```

## Notes

- All hooks use Solid's `createEffect`/`createSignal`/`createStore` — NOT React patterns
- `Accessor<T>` wrapper on queryKey/enabled enables reactive re-subscription
- `deferStream` is Flare-specific — not in standard TanStack Query
- `useSuspenseQuery` is a thin wrapper over TanStack `useQuery` with `throwOnError: true` (Solid `<Loading>` / `<Errored>`). Flare does not export `useQueries`.
- Query cache hydration uses Flare's `flare.q` / `__flare_qc` stream, not TanStack's dehydration channel.
- Query client is provided via Solid context (`QueryClientProvider`)
- `IsRestoringProvider` pauses subscriptions during persistence restore (e.g. `@tanstack/query-persist-client-core`)
- `replaceEqualDeep` used in `useMutationState` to prevent unnecessary re-renders on structurally identical results
