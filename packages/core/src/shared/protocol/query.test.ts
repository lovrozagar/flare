import { afterEach, expect, it } from "vitest";
import { QUERY_GETTER, registeredQuery, registerQuery, type QueryGetter } from "./query.ts";

afterEach(() => {
	Reflect.deleteProperty(globalThis, QUERY_GETTER);
});

function getter(name: string): QueryGetter {
	return Object.assign(() => name, { dehydrate: () => name });
}

// The registry holds one stateless getter per process. The first wins, and a second registration gets it back.
it("registry", () => {
	expect(registeredQuery()).toBeUndefined();
	const first = getter("first");
	expect(registerQuery(first)).toBe(first);
	expect(registerQuery(getter("second"))).toBe(first);
	expect(registeredQuery()).toBe(first);
	Reflect.set(globalThis, QUERY_GETTER, "not a getter");
	expect(registeredQuery()).toBeUndefined();
	Reflect.set(globalThis, QUERY_GETTER, () => "no dehydrate");
	expect(registeredQuery()).toBeUndefined();
});
