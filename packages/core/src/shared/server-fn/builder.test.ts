import { expect, expectTypeOf, it } from "vitest";
import type { FlareRegister } from "../route-builder/register.ts";
import {
	bindServerFn,
	type CreateServerFn,
	type FnStart,
	type ServerFn,
	type ServerFnBuilder,
	type ServerFnRef,
} from "./builder.ts";

// Each entry binds its own call. This one records it, so a row can see what a callable passes on.
const calls: Array<[ServerFnRef, unknown]> = [];
const createServerFn = bindServerFn((fn, input) => {
	calls.push([fn, input]);
	return "called";
});

const handler = async (): Promise<{ n: number }> => ({ n: 1 });

function allowed(): boolean {
	return true;
}

async function* numbers(): AsyncGenerator<number> {
	yield 1;
}

it("default method", () => {
	expect(createServerFn().handler(handler).record).toEqual({ method: "post", authenticate: false, handler });
	expect(createServerFn({ method: "get" }).handler(handler).record.method).toBe("get");
});

it("get with auth and maxAge", () => {
	expect(() => createServerFn({ method: "get" }).authenticate().cache({ maxAge: "1s" }).handler(handler)).toThrow(
		/maxAge/,
	);
	expect(() => createServerFn().cache({ maxAge: "1s" }).handler(handler)).toThrow(/maxAge/);
	expect(() => createServerFn({ method: "get" }).authorize(allowed).cache({ maxAge: "1s" }).handler(handler)).toThrow(
		/maxAge/,
	);
	const cached = createServerFn({ method: "get" }).cache({ maxAge: "1s" }).handler(handler).record;
	expect(cached.cache).toEqual({ maxAge: "1s" });
});

it("stream or handler", () => {
	const chain = createServerFn();
	chain.handler(handler);
	expect(() => chain.stream(numbers)).toThrow(/stream or handler/);
	const streaming = createServerFn().stream(numbers);
	expect(streaming.record.stream).toBe(numbers);
	expect(() => createServerFn({ method: "put" as "get" })).toThrow(/method/);
	const validated = createServerFn()
		.authenticate()
		.input((value: unknown) => value)
		.handler(handler).record;
	expect(validated.authenticate).toBe(true);
	expect(typeof validated.input).toBe("function");
});

const validator = (value: unknown): unknown => value;

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
	};
	for (const [method, build] of Object.entries(twice)) expect(build).toThrow(`${method} twice`);
	const anyOrder = createServerFn().authorize(allowed).input(validator).authenticate().handler(handler).record;
	expect(anyOrder).toMatchObject({ authenticate: true, input: validator, authorize: allowed });
});

// The public signature is the generic that tests/types proves, bound to the app's register.
it("typed", () => {
	expectTypeOf(bindServerFn).returns.toEqualTypeOf<CreateServerFn>();
	expectTypeOf(createServerFn).returns.toEqualTypeOf<ServerFnBuilder<FlareRegister, FnStart>>();
	expectTypeOf(createServerFn().handler(handler)).toEqualTypeOf<ServerFn<void, { n: number }>>();
});

// The callable hands itself and its input to the entry's call. A chain without `__client` runs no render guard.
it("bound", () => {
	const fn = createServerFn({ method: "get" })
		.input((value: unknown) => value)
		.handler(handler);
	expect(fn(4)).toBe("called");
	expect(calls.at(-1)).toEqual([fn, 4]);
});
