import { readFileSync } from "node:fs"
import { createComponent, createRoot } from "solid-js"
import { QueryClient } from "@tanstack/solid-query"
import { afterEach, expect, it, vi } from "vitest"
import { QUERY_GETTER } from "../../../shared/protocol/query.ts"
import { bindServerFn, type ServerFn, type ServerFnRef } from "../../../shared/server-fn/builder.ts"
import { serverFnMutationOptions, serverFnQueryOptions } from "./options.ts"

// The browser's defaults: TanStack retries 3 times in a browser and never on the server.
vi.mock("@tanstack/solid-query", async (original) => ({
	...(await original<typeof import("@tanstack/solid-query")>()),
	isServer: false,
}))

afterEach(() => {
	Reflect.deleteProperty(globalThis, QUERY_GETTER)
})

// A client server function: the call resolves to the handler's value. The helpers read only the call.
function fn<I, O>(handler: (input: I) => O): ServerFn<I, O> {
	return vi.fn<(input: I) => Promise<O>>((input) => Promise.resolve(handler(input))) as unknown as ServerFn<I, O>
}

it("query", async () => {
	const search = fn((input: { q: string }) => ({ hits: [input.q] }))
	const options = serverFnQueryOptions(search, { queryKey: ["search", "a"], input: { q: "a" } })
	expect(options.queryKey).toEqual(["search", "a"])
	expect(await options.queryFn()).toEqual({ hits: ["a"] })
	expect(search).toHaveBeenCalledWith({ q: "a" })
})

// solid-query starts a suspense query's first fetch inside the component's render: an owner, no observer. The
// helper's queryFn runs the call outside any owner, so it does not warn. A hand-written queryFn that calls the
// function directly matches the render check, so it warns in dev. Both reach the transport (BUGS.md B36).
it("queryFn inside a render", async () => {
	const transport = vi.fn<(fn: ServerFnRef, input: unknown) => Promise<unknown>>(async () => ({ up: 1 }))
	const config = { method: "post" as const, __id: "count-id", __name: "count", __client: true }
	const count = bindServerFn(transport)(config)
		.input((value: unknown) => value)
		.handler(() => ({ up: 0 }))
	const helper = serverFnQueryOptions(count, { queryKey: ["count"], input: 1 })
	const handWritten = { queryKey: ["count", "hand"], queryFn: () => count(2) }
	const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
	const fetched: Promise<unknown>[] = []
	createRoot(() =>
		createComponent(() => {
			fetched.push(helper.queryFn())
			expect(warn).not.toHaveBeenCalled()
			fetched.push(handWritten.queryFn())
			return null
		}, {}),
	)
	expect(await Promise.all(fetched)).toEqual([{ up: 1 }, { up: 1 }])
	expect(transport.mock.calls).toEqual([
		[count, 1],
		[count, 2],
	])
	expect(warn).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/count was called during a render/))
	warn.mockRestore()
})

it("query void", async () => {
	const now = fn<void, number>(() => 7)
	const options = serverFnQueryOptions(now, { queryKey: ["now"] })
	expect(await options.queryFn()).toBe(7)
	expect(vi.mocked(now).mock.calls).toEqual([[]])
})

it("mutation", async () => {
	const client = new QueryClient()
	const getter = Object.assign(() => client, { dehydrate: () => undefined })
	Reflect.set(globalThis, QUERY_GETTER, getter)
	const save = fn((input: { name: string }) => ({ id: "1", name: input.name }))
	const options = serverFnMutationOptions(save, { mutationKey: ["user"] })
	const data = await options.mutationFn({ name: "Ana" })
	expect(data).toEqual({ id: "1", name: "Ana" })
	options.onSuccess(data)
	expect(client.getQueryData(["user"])).toEqual({ id: "1", name: "Ana" })
	expect(options.mutationKey).toEqual(["user"])
	// With no getter registered, the cache write has no client and is skipped.
	Reflect.deleteProperty(globalThis, QUERY_GETTER)
	expect(() => options.onSuccess(data)).not.toThrow()
})

it("mutation no key", async () => {
	const save = fn((input: { name: string }) => input.name)
	const options = serverFnMutationOptions(save)
	expect(Object.keys(options)).toEqual(["mutationFn"])
	expect(await options.mutationFn({ name: "b" })).toBe("b")
})

// Query data rides the document state and the app's own requests. The server-function envelope carries none.
it("no side channel", () => {
	const source = readFileSync(new URL("./options.ts", import.meta.url), "utf8")
	expect(source).not.toMatch(/queries/)
	const envelope = readFileSync(new URL("../../../server/server-fn/envelope.ts", import.meta.url), "utf8")
	expect(envelope).not.toMatch(/queries/)
})

// A server function that fails `failures` times with `error`, then answers.
function failing(error: unknown): ServerFn<void, string> {
	return vi.fn<() => Promise<string>>(() => Promise.reject(error)) as unknown as ServerFn<void, string>
}

// A 4xx rejection is deterministic, so the query fails at once. A network failure keeps TanStack's default 3 retries,
// and the app's own `retry` wins (B107, BUGS.md 64).
it("no retry on 4xx", async () => {
	const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })
	const input = Object.assign(new Error("Invalid input"), { status: 400 })
	const rejected = failing(input)
	await expect(client.fetchQuery(serverFnQueryOptions(rejected, { queryKey: ["a"] }))).rejects.toBe(input)
	expect(rejected).toHaveBeenCalledOnce()
	const offline = failing(new TypeError("Failed to fetch"))
	await expect(client.fetchQuery(serverFnQueryOptions(offline, { queryKey: ["b"] }))).rejects.toThrow("Failed to fetch")
	expect(offline).toHaveBeenCalledTimes(4)
	const crashed = failing(Object.assign(new Error("boom"), { status: 500 }))
	await expect(client.fetchQuery(serverFnQueryOptions(crashed, { queryKey: ["c"] }))).rejects.toThrow("boom")
	expect(crashed).toHaveBeenCalledTimes(4)
	const own = failing(input)
	await expect(client.fetchQuery({ ...serverFnQueryOptions(own, { queryKey: ["d"] }), retry: 2 })).rejects.toBe(input)
	expect(own).toHaveBeenCalledTimes(3)
	// On the server, as TanStack's default, nothing retries.
	vi.resetModules()
	vi.doMock("@tanstack/solid-query", async (original) => ({
		...(await original<typeof import("@tanstack/solid-query")>()),
		isServer: true,
	}))
	const server = await import("./options.ts")
	expect(server.serverFnQueryOptions(offline, { queryKey: ["e"] }).retry(0, new TypeError("x"))).toBe(false)
	vi.doUnmock("@tanstack/solid-query")
})
