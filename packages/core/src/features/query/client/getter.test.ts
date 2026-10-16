import { dehydrate, QueryClient, QueryClientProvider, useQuery } from "@tanstack/solid-query"
import { Dynamic, render } from "@solidjs/web"
import { createComponent, flush, Loading } from "solid-js"
import { afterEach, expect, it } from "vitest"
import { QUERY_GETTER, registeredQuery } from "../../../shared/protocol/query.ts"
import { createQueryClientGetter } from "./getter.ts"

// The getter on Solid's client build. The server rows are getter.ssr.test.ts.
type FlareScope = typeof globalThis & { flare?: { queries?: unknown } }

afterEach(() => {
	Reflect.deleteProperty(globalThis, QUERY_GETTER)
	delete (globalThis as FlareScope).flare
})

it("one client", () => {
	const getQueryClient = createQueryClientGetter()
	const client = getQueryClient()
	expect(client).toBeInstanceOf(QueryClient)
	expect(getQueryClient()).toBe(client)
})

// The process holds one getter: a second call returns the first, so two modules never disagree.
it("getter registered once", () => {
	const first = createQueryClientGetter()
	expect(createQueryClientGetter()).toBe(first)
	expect(registeredQuery()).toBe(first)
})

// The document's `queries` seed the client before hydrate, so a query the server resolved does not run again.
it("client seed", () => {
	const server = new QueryClient()
	server.setQueryData(["n"], 42)
	;(globalThis as FlareScope).flare = { queries: JSON.parse(JSON.stringify(dehydrate(server))) }
	const client = createQueryClientGetter()()
	expect(client.getQueryData(["n"])).toBe(42)
	// No state, or state with no queries, is an empty client.
	Reflect.deleteProperty(globalThis, QUERY_GETTER)
	;(globalThis as FlareScope).flare = {}
	expect(createQueryClientGetter()().getQueryData(["n"])).toBeUndefined()
	// The client has no dehydrate to give: the server writes the document state.
	expect(registeredQuery()?.dehydrate()).toBeUndefined()
})

// A document whose `queries` hold ["tally", "a"], and a counted query function for that key.
function documentWithTally(): { runs: () => number; queryFn: () => string } {
	const server = new QueryClient()
	server.setQueryData(["tally", "a"], "server")
	;(globalThis as FlareScope).flare = { queries: JSON.parse(JSON.stringify(dehydrate(server))) }
	let count = 0
	return { runs: () => count, queryFn: () => `client ${++count}` }
}

// A `useQuery` on `key` mounted under the document's client, as the hydration render mounts it. The client boot then
// calls `hydrated()` in the same turn, after the mount, as bootClient does (B102).
function mount(key: readonly unknown[], options: { queryFn: () => string; refetchOnMount?: "always" }): () => void {
	const client = createQueryClientGetter()() as QueryClient
	// The data is read in a tracking scope, under a Loading boundary for a query that is still pending.
	const Tally = () => {
		const query = useQuery(() => ({ queryKey: key, staleTime: 0, ...options }))
		return createComponent(Dynamic, {
			component: "p",
			get children() {
				return String(query.data)
			},
		})
	}
	const host = document.createElement("div")
	const dispose = render(
		() =>
			createComponent(QueryClientProvider, {
				client,
				get children() {
					return createComponent(Loading, {
						fallback: "",
						get children() {
							return createComponent(Tally, {})
						},
					})
				},
			}),
		host,
	)
	return dispose
}

// Lets the query functions run and their results land.
const settled = async (): Promise<void> => {
	for (let round = 0; round < 5; round += 1) {
		await new Promise((resolve) => setTimeout(resolve, 10))
		flush()
	}
}

// A query the document filled does not run again when the hydration render mounts it, on TanStack's default
// staleTime. After the hydrated phase it is TanStack's default again: a remount refetches it (B102).
it("hydration mount", async () => {
	const tally = documentWithTally()
	const dispose = mount(["tally", "a"], { queryFn: tally.queryFn })
	registeredQuery()?.hydrated?.()
	await settled()
	expect(tally.runs()).toBe(0)
	dispose()
	const again = mount(["tally", "a"], { queryFn: tally.queryFn })
	await settled()
	expect(tally.runs()).toBe(1)
	again()
})

// An app-set refetchOnMount wins over the hydration default.
it("hydration mount app wins", async () => {
	const tally = documentWithTally()
	const dispose = mount(["tally", "a"], { queryFn: tally.queryFn, refetchOnMount: "always" })
	registeredQuery()?.hydrated?.()
	await settled()
	expect(tally.runs()).toBe(1)
	dispose()
})

// A query the document did not fill fetches as usual during hydration.
it("hydration mount not in document", async () => {
	const tally = documentWithTally()
	const dispose = mount(["tally", "b"], { queryFn: tally.queryFn })
	registeredQuery()?.hydrated?.()
	await settled()
	expect(tally.runs()).toBe(1)
	dispose()
})

// The registered getter's `clear` empties the document's client, so a query cached for one visitor never paints for
// the next after a server function wrote a cookie. Before any client exists it does nothing (B133).
it("clear", () => {
	const getQueryClient = createQueryClientGetter()
	registeredQuery()?.clear?.()
	const client = getQueryClient()
	client.setQueryData(["user"], "ada")
	registeredQuery()?.clear?.()
	expect(client.getQueryData(["user"])).toBeUndefined()
	expect(getQueryClient()).toBe(client)
})
