import { dehydrate, QueryClient } from "@tanstack/solid-query";
import { afterEach, expect, it } from "vitest";
import { QUERY_GETTER, registeredQuery } from "../../../shared/protocol/query.ts";
import { createQueryClientGetter } from "./getter.ts";

// The getter on Solid's client build. The server rows are getter.ssr.test.ts.
type FlareScope = typeof globalThis & { flare?: { queries?: unknown } };

afterEach(() => {
	Reflect.deleteProperty(globalThis, QUERY_GETTER);
	delete (globalThis as FlareScope).flare;
});

it("one client", () => {
	const getQueryClient = createQueryClientGetter();
	const client = getQueryClient();
	expect(client).toBeInstanceOf(QueryClient);
	expect(getQueryClient()).toBe(client);
});

// The process holds one getter: a second call returns the first, so two modules never disagree.
it("getter registered once", () => {
	const first = createQueryClientGetter();
	expect(createQueryClientGetter()).toBe(first);
	expect(registeredQuery()).toBe(first);
});

// The document's `queries` seed the client before hydrate, so a query the server resolved does not run again.
it("client seed", () => {
	const server = new QueryClient();
	server.setQueryData(["n"], 42);
	(globalThis as FlareScope).flare = { queries: JSON.parse(JSON.stringify(dehydrate(server))) };
	const client = createQueryClientGetter()();
	expect(client.getQueryData(["n"])).toBe(42);
	// No state, or state with no queries, is an empty client.
	Reflect.deleteProperty(globalThis, QUERY_GETTER);
	(globalThis as FlareScope).flare = {};
	expect(createQueryClientGetter()().getQueryData(["n"])).toBeUndefined();
	// The client has no dehydrate to give: the server writes the document state.
	expect(registeredQuery()?.dehydrate()).toBeUndefined();
});
