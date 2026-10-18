import { QueryClient } from "@tanstack/solid-query"
import { afterEach, expect, it } from "vitest"
import { withServerContext } from "../../../server/context/ctx.ts"
import { QUERY_GETTER, registeredQuery } from "../../../shared/protocol/query.ts"
import { fromWire } from "../../../shared/protocol/value.ts"
import { createQueryClientGetter } from "./getter.ts"

// The getter on Solid's server build. The client rows are getter.test.ts.
afterEach(() => {
	Reflect.deleteProperty(globalThis, QUERY_GETTER)
})

function inRequest<T>(run: () => T): Promise<T | undefined> {
	return withServerContext(
		{ request: new Request("http://localhost/"), env: {} },
		async () => run(),
		() => undefined,
	)
}

it("per request", async () => {
	const getQueryClient = createQueryClientGetter()
	const [first, again] = (await inRequest(() => [getQueryClient(), getQueryClient()])) ?? []
	const other = await inRequest(() => getQueryClient())
	expect(first).toBeInstanceOf(QueryClient)
	expect(again).toBe(first)
	expect(other).not.toBe(first)
})

it("outside", () => {
	expect(() => createQueryClientGetter()()).toThrow("the query client getter runs inside a request on the server")
})

// The document state takes the request's cache through the registry. A request that made no client has none.
it("dehydrate", async () => {
	const getQueryClient = createQueryClientGetter()
	const state = await inRequest(() => {
		getQueryClient().setQueryData(["n"], 42)
		return registeredQuery()?.dehydrate()
	})
	expect(JSON.stringify(state)).toContain("42")
	expect(await inRequest(() => registeredQuery()?.dehydrate())).toBeUndefined()
	expect(registeredQuery()?.dehydrate()).toBeUndefined()
})

// solid-query's QueryClientProvider clears the request's client in its server cleanup, which on Workers runs before
// the document state is written. A query that succeeded in the request is still dehydrated (BUGS.md B54).
it("cleared before dehydrate", async () => {
	const getQueryClient = createQueryClientGetter()
	const state = await inRequest(async () => {
		const client = getQueryClient()
		await client.prefetchQuery({ queryKey: ["search", "route"], queryFn: () => "hits" })
		await client.prefetchQuery({ queryKey: ["failed"], queryFn: () => Promise.reject(new Error("no")) })
		client.clear()
		return registeredQuery()?.dehydrate()
	})
	const hashes = Reflect.get(Object(state), "queries").map((query: { queryHash: string }) => query.queryHash)
	expect(hashes).toEqual(['["search","route"]'])
	expect(JSON.stringify(state)).toContain("hits")
})

// A query's data is an app value, so the document state carries it on the wire, as a loader's data and a server
// function's answer travel: a Date the server cached is a Date where the client reads it (B145, BUGS.md 364).
it("dehydrate wire values", async () => {
	const getQueryClient = createQueryClientGetter()
	const when = new Date("2026-10-01T00:00:00.000Z")
	const state = await inRequest(() => {
		getQueryClient().setQueryData(["when"], { when, tags: new Set(["a"]) })
		return registeredQuery()?.dehydrate()
	})
	const [query] = Reflect.get(Object(JSON.parse(JSON.stringify(state))), "queries") as { state: { data: unknown } }[]
	expect(fromWire(query?.state.data)).toEqual({ when, tags: new Set(["a"]) })
})
