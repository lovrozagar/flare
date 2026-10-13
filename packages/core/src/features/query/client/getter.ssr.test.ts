import { QueryClient } from "@tanstack/solid-query";
import { afterEach, expect, it } from "vitest";
import { withServerContext } from "../../../server/context/ctx.ts";
import { QUERY_GETTER, registeredQuery } from "../../../shared/protocol/query.ts";
import { createQueryClientGetter } from "./getter.ts";

// The getter on Solid's server build. The client rows are getter.test.ts.
afterEach(() => {
	Reflect.deleteProperty(globalThis, QUERY_GETTER);
});

function inRequest<T>(run: () => T): Promise<T | undefined> {
	return withServerContext(
		{ request: new Request("http://localhost/"), env: {} },
		async () => run(),
		() => undefined,
	);
}

it("per request", async () => {
	const getQueryClient = createQueryClientGetter();
	const [first, again] = (await inRequest(() => [getQueryClient(), getQueryClient()])) ?? [];
	const other = await inRequest(() => getQueryClient());
	expect(first).toBeInstanceOf(QueryClient);
	expect(again).toBe(first);
	expect(other).not.toBe(first);
});

it("outside", () => {
	expect(() => createQueryClientGetter()()).toThrow("the query client getter runs inside a request on the server");
});

// The document state takes the request's cache through the registry. A request that made no client has none.
it("dehydrate", async () => {
	const getQueryClient = createQueryClientGetter();
	const state = await inRequest(() => {
		getQueryClient().setQueryData(["n"], 42);
		return registeredQuery()?.dehydrate();
	});
	expect(JSON.stringify(state)).toContain("42");
	expect(await inRequest(() => registeredQuery()?.dehydrate())).toBeUndefined();
	expect(registeredQuery()?.dehydrate()).toBeUndefined();
});
