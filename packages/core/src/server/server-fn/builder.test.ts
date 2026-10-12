import { expect, it } from "vitest";
import { createServerFn } from "./builder.ts";

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
