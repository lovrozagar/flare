import { expect, expectTypeOf, it } from "vitest"
import type { FlareRegister } from "../route-builder/register.ts"
import {
	bindServerFn,
	type CreateServerFn,
	type FnStart,
	type ServerFn,
	type ServerFnBuilder,
	type ServerFnRef,
} from "./builder.ts"

// Each entry binds its own call. This one records it, so a row can see what a callable passes on.
const calls: Array<[ServerFnRef, unknown]> = []
const createServerFn = bindServerFn((fn, input) => {
	calls.push([fn, input])
	return "called"
})

const handler = async (): Promise<{ n: number }> => ({ n: 1 })

function allowed(): boolean {
	return true
}

async function* numbers(): AsyncGenerator<number> {
	yield 1
}

it("default method", () => {
	expect(createServerFn().handler(handler).record).toEqual({
		kind: "handler",
		method: "post",
		authenticate: false,
		handler,
	})
	expect(createServerFn({ method: "get" }).handler(handler).record.method).toBe("get")
})

it("get with auth and maxAge", () => {
	expect(() => createServerFn({ method: "get" }).authenticate().cache({ maxAge: "1s" }).handler(handler)).toThrow(
		/maxAge/,
	)
	expect(() => createServerFn().cache({ maxAge: "1s" }).handler(handler)).toThrow(/maxAge/)
	expect(() => createServerFn({ method: "get" }).authorize(allowed).cache({ maxAge: "1s" }).handler(handler)).toThrow(
		/maxAge/,
	)
	const cached = createServerFn({ method: "get" }).cache({ maxAge: "1s" }).handler(handler).record
	expect(cached.cache).toEqual({ maxAge: "1s" })
})

// A `maxAge` that is no duration throws when the chain is built, naming it, not on each call after the handler ran
// (BUGS.md 393).
it("maxAge checked", () => {
	for (const maxAge of ["1 minute", "", "1y", "-1s"]) {
		const cache = { maxAge } as unknown as { maxAge: "1s" }
		expect(() => createServerFn({ method: "get" }).cache(cache)).toThrow(
			`cache.maxAge ${JSON.stringify(maxAge)} is no duration`,
		)
	}
	expect(() => createServerFn({ method: "get" }).cache({ maxAge: "1m30s" })).not.toThrow()
})

it("stream or handler", () => {
	const chain = createServerFn()
	chain.handler(handler)
	expect(() => chain.stream(numbers)).toThrow(/stream or handler/)
	const streaming = createServerFn().stream(numbers)
	expect(streaming.record.stream).toBe(numbers)
	expect(() => createServerFn({ method: "put" as "get" })).toThrow(/method/)
	const validated = createServerFn()
		.authenticate()
		.input((value: unknown) => value)
		.handler(handler).record
	expect(validated.authenticate).toBe(true)
	expect(typeof validated.input).toBe("function")
})

// The client graph's transform strips the generator to `undefined`, so the kind comes from the method (BUGS.md B14).
it("stream kind", () => {
	expect(createServerFn().stream(numbers).record.kind).toBe("stream")
	expect(createServerFn().stream(undefined as never).record.kind).toBe("stream")
})

const validator = (value: unknown): unknown => value

// Each method once, as on a route builder: a second call would silently replace the first (dx/server-fn.md).
it("once", () => {
	const twice = {
		// @ts-expect-error the type drops a method once it is called
		authenticate: () => createServerFn().authenticate().authenticate(),
		// @ts-expect-error the type drops a method once it is called
		input: () => createServerFn().input(validator).input(validator),
		// @ts-expect-error the type drops a method once it is called
		authorize: () => createServerFn().authorize(allowed).authorize(allowed),
		// @ts-expect-error the type drops a method once it is called
		cache: () => createServerFn({ method: "get" }).cache({ maxAge: "1s" }).cache({ maxAge: "1s" }),
	}
	for (const [method, build] of Object.entries(twice)) expect(build).toThrow(`${method} twice`)
	const anyOrder = createServerFn().authorize(allowed).input(validator).authenticate().handler(handler).record
	expect(anyOrder).toMatchObject({ authenticate: true, input: validator, authorize: allowed })
})

// The public signature is the generic that tests/types proves, bound to the app's register.
it("typed", () => {
	expectTypeOf(bindServerFn).returns.toEqualTypeOf<CreateServerFn>()
	expectTypeOf(createServerFn).returns.toEqualTypeOf<ServerFnBuilder<FlareRegister, FnStart>>()
	expectTypeOf(createServerFn().handler(handler)).toEqualTypeOf<ServerFn<void, { n: number }>>()
})

// The callable hands itself and its input to the entry's call. A chain without `__client` runs no render guard.
it("bound", () => {
	const fn = createServerFn({ method: "get" })
		.input((value: unknown) => value)
		.handler(handler)
	expect(fn(4)).toBe("called")
	expect(calls.at(-1)).toEqual([fn, 4])
})
