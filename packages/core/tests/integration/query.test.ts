import { createComponent, Loading } from "solid-js"
import { Dynamic } from "@solidjs/web"
import { QueryClientProvider, type QueryClient } from "@tanstack/solid-query"
import { expect, it } from "vitest"
import {
	createQueryClientGetter,
	serverFnMutationOptions,
	serverFnQueryOptions,
	useSuspenseQuery,
} from "../../src/exports/query.ts"
import { createServerFn } from "../../src/server/server-fn/dispatch.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"
import { fromWire } from "../../src/shared/protocol/value.ts"
import { bodyOf, documentOf, serve } from "./builder-app.ts"

// dx/features.md's Query rows through the real createServer(...).fetch (B96): the request's client from the getter,
// a loader's prefetch through serverFnQueryOptions, a render's useSuspenseQuery under Loading, and the queries the
// document hands the client. Server functions carry the id the boundary transform would write.

const getQueryClient = createQueryClientGetter()
let calls = 0
const greet = createServerFn({ method: "get", __id: "greet00000000000", __name: "greet" } as never)
	.input((value: unknown) => value as { name: string })
	.handler(({ input }) => {
		calls += 1
		return `hi ${input.name}`
	})
const save = createServerFn({ method: "post", __id: "save000000000000", __name: "save" } as never)
	.input((value: unknown) => value as { n: number })
	.handler(({ input }) => input.n * 2)
const greeting = (name: string) => serverFnQueryOptions(greet as never, { queryKey: ["greet", name], input: { name } })

// The root gives the app TanStack's provider over the request's client, as an app's root does.
const root = createRootLayout("_root_").render((props) =>
	createComponent(QueryClientProvider, {
		client: getQueryClient(),
		get children() {
			return documentOf(props.children)
		},
	}),
)
const layouts = { _root_: root }

// A page whose loader prefetches the greeting into the request's client, and whose render reads it under Loading. The
// render also names whether the getter returned the loader's client.
const page = createPage("_root_/q")
	.loader(async (ctx) => {
		// `queryClient` is typed once the app registers the getter; this test registers no types.
		const { queryClient } = ctx as unknown as { queryClient: QueryClient }
		await queryClient.prefetchQuery(greeting("ana"))
		return { same: "pending" }
	})
	.render(() => {
		const query = useSuspenseQuery(() => greeting("ana"))
		return createComponent(Dynamic, {
			component: "p",
			get children() {
				return createComponent(Loading, {
					fallback: "wait",
					get children() {
						return String(query.data)
					},
				})
			},
		})
	})

// Each dehydrated query's data, read back from the wire.
function queryData(state: unknown): unknown[] {
	const queries = Reflect.get(Object(state), "queries") as { state: { data: unknown } }[]
	return queries.map((query) => fromWire(query.state.data))
}

// The request's client is one per request, and the loader's prefetch fills it: the render shows the data with no
// second call, and the document's state carries the query for the client. Outside a request the getter throws.
it("query client", async () => {
	calls = 0
	const get = serve([{ id: "_root_/q", path: "/q", module: page }], { layouts })
	const answer = await get("/q")
	expect(bodyOf(answer.text)).toBe("<p>hi ana</p>")
	expect(calls).toBe(1)
	const state = /self\.flare=(.*?)<\/script>/s.exec(answer.text)?.[1] ?? ""
	expect(state).toContain('"queryKey":["greet","ana"]')
	// The query's data is a wire value, as every app value in the state is (B145, BUGS.md 364).
	expect(queryData(JSON.parse(state).queries)).toEqual(["hi ana"])
	await get("/q")
	expect(calls).toBe(2)
	expect(() => getQueryClient()).toThrow("the query client getter runs inside a request on the server")
})

// A data answer carries the request's query cache as one `q` frame after the loaders' frames and before `r`, so a
// client navigation's prefetched query paints with no request of its own; a request that made no client writes none
// (plan 21 3.15, B134).
it("data queries", async () => {
	calls = 0
	const get = serve([{ id: "_root_/q", path: "/q", module: page }], { layouts })
	const frames = (await get("/q?_flare=data")).text
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line) as { t: string })
	const kinds = frames.map((frame) => frame.t)
	expect(kinds.indexOf("q")).toBe(kinds.indexOf("r") - 1)
	expect(queryData(Reflect.get(Object(frames.find((frame) => frame.t === "q")), "d"))).toEqual(["hi ana"])
	expect(calls).toBe(1)
	const plain = createPage("_root_/plain").render(() => "plain")
	const bare = await serve([{ id: "_root_/plain", path: "/plain", module: plain }], { layouts })("/plain?_flare=data")
	expect(bare.text).not.toContain('"t":"q"')
})

// serverFnQueryOptions: the key as given. serverFnMutationOptions: a mutationFn that returns the function's data, and
// with a mutationKey an onSuccess that writes it; without one, none. A server function runs inside a request, so the
// mutation runs in a loader.
it("server fn options", async () => {
	expect(greeting("bo").queryKey).toEqual(["greet", "bo"])
	const keyed = serverFnMutationOptions(save as never, { mutationKey: ["saved"] })
	expect(typeof keyed.onSuccess).toBe("function")
	expect(Object.keys(serverFnMutationOptions(save as never))).toEqual(["mutationFn"])
	const saving = createPage("_root_/m")
		.loader(async () => ({ text: String(await (keyed.mutationFn as (input: unknown) => Promise<unknown>)({ n: 21 })) }))
		.render((props) => props.loaderData.text)
	const answer = await serve([{ id: "_root_/m", path: "/m", module: saving }], { layouts })("/m")
	expect(bodyOf(answer.text)).toBe("42")
})
