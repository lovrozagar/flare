import { runWithOwner } from "solid-js";
import { isServer, QueryClient } from "@tanstack/solid-query";
import { registeredQuery } from "../../../shared/protocol/index.ts";
import type { ServerFn } from "../../../shared/server-fn/builder.ts";

type QueryKey = readonly unknown[];

// `input` is required when the server function takes one, and absent when its input is `void`. The helper does not
// append it to `queryKey` (dx/features.md Query).
export type QueryOptionsInput<I> = [I] extends [void] ? { queryKey: QueryKey } : { queryKey: QueryKey; input: I };

export type ServerFnQueryOptions<O> = {
	queryKey: QueryKey;
	queryFn: () => Promise<O>;
	retry: (failureCount: number, error: unknown) => boolean;
};

// TanStack's default retry count in a browser. On the server it never retries.
const RETRIES = 3;

// `queryFn` calls the server function and returns the handler's value. `retry` skips a deterministic rejection. Query data rides the document state and the
// app's own requests. There is no side channel in a server function's envelope. solid-query starts a suspense query's
// first fetch inside the component's render, where the client stub refuses a direct call (B45), so the queryFn calls
// it outside any owner: a queryFn is not that call (B85, BUGS.md B36).
export function serverFnQueryOptions<I, O>(
	fn: ServerFn<I, O>,
	options: QueryOptionsInput<NoInfer<I>>,
): ServerFnQueryOptions<O> {
	const args = "input" in options ? [options.input] : [];
	return {
		queryKey: options.queryKey,
		queryFn: () => runWithOwner(null, () => Reflect.apply(fn, undefined, args)),
		retry,
	};
}

// A server function's rejection with a 4xx status (an input issue, `unauthenticated`, `unauthorized`, `notFound`) is
// deterministic, so the query fails at once. A network failure or a 5xx keeps TanStack's default. An app's own
// `retry` on the options wins (B107).
function retry(failureCount: number, error: unknown): boolean {
	if (isServer) return false;
	const status: unknown = Reflect.get(Object(error), "status");
	const rejected = typeof status === "number" && status >= 400 && status < 500;
	return !rejected && failureCount < RETRIES;
}

type MutationFn<I, O> = [I] extends [void] ? () => Promise<O> : (input: I) => Promise<O>;

export type ServerFnMutationOptions<I, O> = { mutationFn: MutationFn<I, O> };

export type ServerFnKeyedMutationOptions<I, O> = ServerFnMutationOptions<I, O> & {
	mutationKey: QueryKey;
	onSuccess: (data: O) => void;
};

// `mutationFn(input)` calls the server function. With `mutationKey`, `onSuccess` writes the returned value into the
// registered client under that key. Without it there is no `onSuccess`. An `onSuccess` the app passes replaces this one.
export function serverFnMutationOptions<I, O>(fn: ServerFn<I, O>): ServerFnMutationOptions<I, O>;
export function serverFnMutationOptions<I, O>(
	fn: ServerFn<I, O>,
	options: { mutationKey: QueryKey },
): ServerFnKeyedMutationOptions<I, O>;
export function serverFnMutationOptions<I, O>(
	fn: ServerFn<I, O>,
	options?: { mutationKey: QueryKey },
): ServerFnMutationOptions<I, O> | ServerFnKeyedMutationOptions<I, O> {
	const mutationFn: MutationFn<I, O> = Object.assign((...args: unknown[]) => Reflect.apply(fn, undefined, args));
	if (options === undefined) return { mutationFn };
	const key = options.mutationKey;
	const onSuccess = (data: O): void => {
		const client = registeredQuery()?.();
		if (client instanceof QueryClient) client.setQueryData(key, data);
	};
	return { mutationFn, mutationKey: key, onSuccess };
}
