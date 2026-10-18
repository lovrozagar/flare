// dx/types.md "Matrix", the query helper, server function, and query client rows (cases 68 to 79), read through the
// package entries from the register codegen wrote for this app. app.test.ts compiles this file; vitest never runs it
// (B96, plan 25 5.2).
import { createPage } from "@lovrozagar/flare"
import { createQueryClientGetter, serverFnMutationOptions, serverFnQueryOptions } from "@lovrozagar/flare/query"
import { createServerFn } from "@lovrozagar/flare/server-fn"
import { expectTypeOf, it } from "vitest"

const anything: any = null
const unknownValue: unknown = null
const query = { q: "" }

const queryParse = { parse: (value: { q: string }) => value }
const stringParse = { parse: (value: string) => value.length }
const querySchema = {
	"~standard": {
		validate: (value: unknown) => ({ value: { q: String(Reflect.get(Object(value), "q")) } }),
		types: { input: query, output: query },
	},
}
const anySchema = {
	"~standard": { validate: (value: unknown) => ({ value }), types: { input: anything, output: anything } },
}
const unknownSchema = {
	"~standard": { validate: (value: unknown) => ({ value }), types: { input: unknownValue, output: unknownValue } },
}

const search = createServerFn()
	.input(queryParse)
	.handler(({ input }) => ({ q: input.q }))
const ping = createServerFn().handler((): string => "ok")
const make = createServerFn().handler((): { id: string } => ({ id: "1" }))
const echo = createServerFn()
	.input(querySchema)
	.handler(({ input }) => input.q)
const measure = createServerFn()
	.input(stringParse)
	.handler(({ input }) => input * 2)
const looseHandler = createServerFn()
	.input(anySchema)
	.handler(({ input }) => input)
const looseStream = createServerFn()
	.input(anySchema)
	.stream(async function* () {
		yield 1
	})
const unknownHandler = createServerFn()
	.input(unknownSchema)
	.handler(({ input }) => input)
const probe = createServerFn().handler((ctx) => ctx.input)
const secret = createServerFn().handler(() => ({ secret: "s" }))
const ticks = createServerFn().stream(async function* ({ signal }) {
	yield { n: signal.aborted ? 0 : 1 }
	return "done"
})
const auth = createServerFn().authenticate()
const renderBody = (): null => {
	expectTypeOf(echo({ q: "a" })).toEqualTypeOf<Promise<string>>()
	return null
}

it("query options input", () => {
	expectTypeOf(serverFnQueryOptions(search, { queryKey: ["s"], input: { q: "a" } }).queryFn).toEqualTypeOf<
		() => Promise<{ q: string }>
	>()
	expectTypeOf<Parameters<typeof serverFnQueryOptions<{ q: string }, { q: string }>>[1]>().toEqualTypeOf<{
		queryKey: readonly unknown[]
		input: { q: string }
	}>()
	// @ts-expect-error input is required when the server function takes one
	void serverFnQueryOptions(search, { queryKey: ["s"] })
	// @ts-expect-error a fresh extra key
	void serverFnQueryOptions(search, { queryKey: ["s"], input: { q: "a" }, extra: 1 })
	// @ts-expect-error input is { q: string }
	void serverFnQueryOptions(search, { queryKey: ["s"], input: { q: 1 } })
})

it("query options void", () => {
	expectTypeOf(serverFnQueryOptions(ping, { queryKey: ["p"] }).queryFn).toEqualTypeOf<() => Promise<string>>()
	// @ts-expect-error input is not taken when the server function has none
	void serverFnQueryOptions(ping, { queryKey: ["p"], input: undefined })
})

it("mutation options", () => {
	const keyed = serverFnMutationOptions(make, { mutationKey: ["m"] })
	const bare = serverFnMutationOptions(make)
	expectTypeOf(bare.mutationFn).toEqualTypeOf<() => Promise<{ id: string }>>()
	expectTypeOf(keyed.onSuccess).parameter(0).toEqualTypeOf<{ id: string }>()
	expectTypeOf(bare).not.toHaveProperty("onSuccess")
	// @ts-expect-error onSuccess receives the value, not the envelope
	expectTypeOf(keyed.onSuccess).parameter(0).toEqualTypeOf<{ data: { id: string } }>()
	// @ts-expect-error onSuccess is present only with a mutationKey
	expectTypeOf(bare).toHaveProperty("onSuccess")
})

it("server fn input", () => {
	expectTypeOf(echo).parameter(0).toEqualTypeOf<{ q: string }>()
	expectTypeOf(measure).parameter(0).toEqualTypeOf<string>()
	// @ts-expect-error a fresh extra key
	void echo({ q: "a", extra: 1 })
	// @ts-expect-error the argument is required
	void echo()
	// @ts-expect-error the argument is the input, a string
	void measure(4)
	// @ts-expect-error the argument is required
	void measure()
})

it("server fn input any", () => {
	expectTypeOf(looseHandler).parameter(0).toBeAny()
	expectTypeOf(looseStream).parameter(0).toBeAny()
	expectTypeOf(serverFnQueryOptions(looseHandler, { queryKey: ["a"], input: 1 }).queryFn).returns.toEqualTypeOf<
		Promise<any>
	>()
	expectTypeOf<Parameters<typeof serverFnQueryOptions<any, any>>[1]>().toHaveProperty("input").toBeAny()
	// @ts-expect-error a call with no argument
	void looseHandler()
})

it("server fn input void", () => {
	expectTypeOf(probe).parameters.toEqualTypeOf<[]>()
	expectTypeOf(probe).returns.toEqualTypeOf<Promise<undefined>>()
	// @ts-expect-error a value passed to a void input
	void probe({ q: "a" })
})

it("server fn schema unknown", () => {
	expectTypeOf(unknownHandler).parameter(0).toBeUnknown()
	expectTypeOf(unknownHandler).returns.toEqualTypeOf<Promise<unknown>>()
	// A bad key is not rejected: the argument accepts any value, since the schema's type is unknown.
	void unknownHandler({ bad: 1 })
})

it("server fn return", () => {
	expectTypeOf(secret).returns.toEqualTypeOf<Promise<{ secret: string }>>()
	// @ts-expect-error the client sees the value, not the envelope
	expectTypeOf<Awaited<ReturnType<typeof secret>>>().toEqualTypeOf<{ data: { secret: string } }>()
	// @ts-expect-error secret is not stripped
	expectTypeOf<Awaited<ReturnType<typeof secret>>>().not.toHaveProperty("secret")
})

it("server fn stream", () => {
	expectTypeOf(ticks).returns.toEqualTypeOf<AsyncIterable<{ n: number }>>()
	void createServerFn().stream(async function* (ctx) {
		// @ts-expect-error a stream context has no revalidate
		yield ctx.revalidate
	})
	// @ts-expect-error a handler context has no signal
	void createServerFn().handler((ctx) => ctx.signal)
})

it("server fn render call", () => {
	expectTypeOf(renderBody).returns.toEqualTypeOf<null>()
	void createPage("_root_/about").render(renderBody)
})

it("server fn methods", () => {
	expectTypeOf(auth).toHaveProperty("input")
	expectTypeOf(auth).toHaveProperty("authorize")
	expectTypeOf(auth).toHaveProperty("handler")
	expectTypeOf(auth).toHaveProperty("stream")
	// @ts-expect-error authenticate was called and is no longer offered
	expectTypeOf(auth).toHaveProperty("authenticate")
})

it("query client present", () => {
	void createPage("_root_/about").loader((ctx) => {
		expectTypeOf(ctx.queryClient).toEqualTypeOf<ReturnType<ReturnType<typeof createQueryClientGetter>>>()
		return {}
	})
	void createPage("_root_/about").preloader((ctx) => {
		// @ts-expect-error queryClient is not on a preloader
		void ctx.queryClient
		return {}
	})
	void createPage("_root_/about").render((props) => {
		// @ts-expect-error queryClient is not on render props
		void props.queryClient
		return null
	})
	void createPage("_root_/about").head((ctx) => {
		// @ts-expect-error queryClient is not on head
		void ctx.queryClient
		return {}
	})
})
