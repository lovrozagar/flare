import { readFileSync } from "node:fs";
import { QueryClient } from "@tanstack/solid-query";
import { afterEach, expect, it, vi } from "vitest";
import { QUERY_GETTER } from "../../../shared/protocol/query.ts";
import type { ServerFn } from "../../../shared/server-fn/builder.ts";
import { serverFnMutationOptions, serverFnQueryOptions } from "./options.ts";

afterEach(() => {
	Reflect.deleteProperty(globalThis, QUERY_GETTER);
});

// A client server function: the call resolves to the handler's value. The helpers read only the call.
function fn<I, O>(handler: (input: I) => O): ServerFn<I, O> {
	return vi.fn<(input: I) => Promise<O>>((input) => Promise.resolve(handler(input))) as unknown as ServerFn<I, O>;
}

it("query", async () => {
	const search = fn((input: { q: string }) => ({ hits: [input.q] }));
	const options = serverFnQueryOptions(search, { queryKey: ["search", "a"], input: { q: "a" } });
	expect(options.queryKey).toEqual(["search", "a"]);
	expect(await options.queryFn()).toEqual({ hits: ["a"] });
	expect(search).toHaveBeenCalledWith({ q: "a" });
});

it("query void", async () => {
	const now = fn<void, number>(() => 7);
	const options = serverFnQueryOptions(now, { queryKey: ["now"] });
	expect(await options.queryFn()).toBe(7);
	expect(vi.mocked(now).mock.calls).toEqual([[]]);
});

it("mutation", async () => {
	const client = new QueryClient();
	const getter = Object.assign(() => client, { dehydrate: () => undefined });
	Reflect.set(globalThis, QUERY_GETTER, getter);
	const save = fn((input: { name: string }) => ({ id: "1", name: input.name }));
	const options = serverFnMutationOptions(save, { mutationKey: ["user"] });
	const data = await options.mutationFn({ name: "Ana" });
	expect(data).toEqual({ id: "1", name: "Ana" });
	options.onSuccess(data);
	expect(client.getQueryData(["user"])).toEqual({ id: "1", name: "Ana" });
	expect(options.mutationKey).toEqual(["user"]);
	// With no getter registered, the cache write has no client and is skipped.
	Reflect.deleteProperty(globalThis, QUERY_GETTER);
	expect(() => options.onSuccess(data)).not.toThrow();
});

it("mutation no key", async () => {
	const save = fn((input: { name: string }) => input.name);
	const options = serverFnMutationOptions(save);
	expect(Object.keys(options)).toEqual(["mutationFn"]);
	expect(await options.mutationFn({ name: "b" })).toBe("b");
});

// Query data rides the document state and the app's own requests. The server-function envelope carries none.
it("no side channel", () => {
	const source = readFileSync(new URL("./options.ts", import.meta.url), "utf8");
	expect(source).not.toMatch(/queries/);
	const envelope = readFileSync(new URL("../../../server/server-fn/envelope.ts", import.meta.url), "utf8");
	expect(envelope).not.toMatch(/queries/);
});
