import { getRequestEvent, isServer } from "@solidjs/web"
import { dehydrate, hydrate, QueryClient, type Query } from "@tanstack/solid-query"
import { registeredQuery, registerQuery, type QueryGetter } from "../../../shared/protocol/index.ts"

// A loader's `ctx.queryClient` is TanStack's client once the app imports `./query`, which loads this module
// (dx/types.md `query client present`). Core declares the empty register and never names TanStack.
declare module "@lovrozagar/flare" {
	interface QueryClientRegister {
		client: QueryClient
	}
}

// Where the server keeps a request's client: the request event's `locals`, which a loader's scope shares.
const LOCALS_KEY = "flare.queryClient"

// A request's client and the queries that succeeded in it, which outlive a clear of the client (BUGS.md B54).
class RequestQueries {
	readonly succeeded = new Map<string, Query>()
	constructor(readonly client: QueryClient) {}
}

// Marks a getter this module made, so the registered one can be returned with its type.
const BRAND = Symbol.for("flare.query.getter")

type ClientGetter = (() => QueryClient) & { dehydrate: () => unknown; hydrated: () => void; clear: () => void }

// One client per document on the client, one per request on the server (dx/features.md Query). The getter registers
// once per process, and a second call returns the registered one. It takes no options. The app passes its client to
// TanStack's provider. A loader reads the same client as `ctx.queryClient`.
export function createQueryClientGetter(): () => QueryClient {
	const registered = registeredQuery()
	if (registered !== undefined && ours(registered)) return registered
	let documentClient: QueryClient | undefined
	const phase = { hydrated: false }
	const getter = (): QueryClient => {
		if (isServer) return (requestQueries() ?? createRequestQueries()).client
		documentClient ??= seeded(phase)
		return documentClient
	}
	const created = Object.assign(getter, {
		dehydrate: () => {
			const request = isServer ? requestQueries() : undefined
			return request === undefined ? undefined : requestState(request)
		},
		// The client boot calls this once the hydration mount is over (B102).
		hydrated: () => void (phase.hydrated = true),
		// A server function wrote a cookie, or the app called `invalidate()`: the cached queries may be another
		// visitor's, so they go, not refetch while showing (B133).
		clear: () => documentClient?.clear(),
		[BRAND]: true,
	})
	registerQuery(created)
	return created
}

function ours(getter: QueryGetter): getter is ClientGetter {
	return Reflect.get(getter, BRAND) === true
}

// The request's client and its succeeded queries, or nothing when the request made none or there is no request.
function requestQueries(): RequestQueries | undefined {
	const event = getRequestEvent()
	const found: unknown = event === undefined ? undefined : Reflect.get(event.locals, LOCALS_KEY)
	return found instanceof RequestQueries ? found : undefined
}

// solid-query's QueryClientProvider clears this client in its server cleanup, which on Workers runs before the
// document state is written. So each query that succeeds is kept as it lands, and the state includes it whatever
// the cleanup did first (BUGS.md B54).
function createRequestQueries(): RequestQueries {
	const event = getRequestEvent()
	if (event === undefined) throw new Error("the query client getter runs inside a request on the server")
	const request = new RequestQueries(new QueryClient())
	request.client.getQueryCache().subscribe(({ query }) => {
		if (query.state.status === "success") request.succeeded.set(query.queryHash, query)
	})
	Reflect.set(event.locals, LOCALS_KEY, request)
	return request
}

// The request's dehydrated cache, plus each query that succeeded in it and was cleared since.
function requestState(request: RequestQueries): ReturnType<typeof dehydrate> {
	const cleared = new QueryClient()
	for (const query of request.succeeded.values())
		if (request.client.getQueryCache().get(query.queryHash) === undefined) cleared.getQueryCache().add(query)
	const live = dehydrate(request.client)
	return { ...live, queries: [...live.queries, ...dehydrate(cleared).queries] }
}

// The document's `queries`, which the server wrote into the state script, fill the client before hydrate, so a query
// the server resolved does not run again. Until the hydrated phase, the hydration render's mount of such a query does
// not refetch it either, whatever its staleTime; afterwards, and for any other query, TanStack's default applies. An
// app's own `refetchOnMount` wins (B102).
function seeded(phase: { hydrated: boolean }): QueryClient {
	const state: unknown = Reflect.get(Object(Reflect.get(globalThis, "flare")), "queries")
	const filled = new Set(documentHashes(state))
	const refetchOnMount = (query: { queryHash: string }): boolean => phase.hydrated || !filled.has(query.queryHash)
	const client = new QueryClient({ defaultOptions: { queries: { refetchOnMount } } })
	if (typeof state === "object" && state !== null) hydrate(client, state)
	return client
}

// The hashes of the queries a dehydrated state holds.
function documentHashes(state: unknown): string[] {
	const queries: unknown = Reflect.get(Object(state), "queries")
	if (!Array.isArray(queries)) return []
	return queries
		.map((query: unknown) => Reflect.get(Object(query), "queryHash"))
		.filter((hash) => typeof hash === "string")
}
