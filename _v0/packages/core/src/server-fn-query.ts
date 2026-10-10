/**
 * Client-safe query/mutation option helpers for server functions.
 * This module must NOT import from ./server-fn/index.ts or ./server-context
 * to avoid pulling in node:async_hooks on the client.
 */

import { callServerFnOverHttp } from "./server-fn/rpc.ts";

export interface PiggybackedQuery {
	data: unknown;
	key: unknown[];
}

interface ServerFnRegistration {
	id?: string;
	method?: string;
	name: string;
}

interface ServerFnLike<TInput, TOutput> {
	(input: TInput): Promise<TOutput>;
	_registration?: ServerFnRegistration;
}

interface QueryClientLike {
	invalidateQueries(options: { queryKey: unknown[] }): Promise<void>;
	setQueryData(key: unknown[], data: unknown): unknown;
}

interface ServerFnQueryConfig<TInput> {
	input?: TInput;
	onRevalidate?: (tags: string[]) => void;
	queryClient?: QueryClientLike;
	queryKey?: unknown[];
	staleTime?: number;
}

export function serverFnQueryOptions<TInput, TOutput>(
	serverFn: ServerFnLike<TInput, TOutput>,
	config?: ServerFnQueryConfig<TInput>,
): { queryFn: () => Promise<TOutput>; queryKey: unknown[]; staleTime?: number } {
	const reg = serverFn._registration;
	const name = reg?.name ?? "unknown";
	const id = reg?.id ?? name;
	const queryKey = config?.queryKey ?? [name, config?.input];

	return {
		queryFn: async () => {
			if (typeof window === "undefined") {
				return serverFn(config?.input as TInput);
			}

			const json = await callServerFnOverHttp<TOutput>({ id, method: reg?.method ?? "post", name }, config?.input);

			if (json.queries && config?.queryClient) {
				for (const q of json.queries) {
					if (Array.isArray(q.key)) {
						config.queryClient.setQueryData(q.key, q.data);
					}
				}
			}

			if (json.revalidatedTags && json.revalidatedTags.length > 0 && config?.onRevalidate) {
				config.onRevalidate(json.revalidatedTags);
			}

			return json.data;
		},
		queryKey,
		staleTime: config?.staleTime,
	};
}

interface ServerFnMutationConfig {
	invalidates?: unknown[][];
	onRevalidate?: (tags: string[]) => void;
	queryClient?: QueryClientLike;
}

export function serverFnMutationOptions<TInput, TOutput>(
	serverFn: ServerFnLike<TInput, TOutput>,
	config?: ServerFnMutationConfig,
): {
	mutationFn: (input: TInput) => Promise<TOutput>;
	onSuccess?: () => void;
} {
	const reg = serverFn._registration;
	const name = reg?.name ?? "unknown";
	const id = reg?.id ?? name;

	return {
		mutationFn: async (input: TInput) => {
			if (typeof window === "undefined") {
				return serverFn(input);
			}

			/* mutations always POST, whatever the fn's own method */
			const json = await callServerFnOverHttp<TOutput>({ id, method: "post", name }, input);

			if (json.queries && config?.queryClient) {
				for (const q of json.queries) {
					if (Array.isArray(q.key)) {
						config.queryClient.setQueryData(q.key, q.data);
					}
				}
			}

			if (json.revalidatedTags && json.revalidatedTags.length > 0 && config?.onRevalidate) {
				config.onRevalidate(json.revalidatedTags);
			}

			return json.data;
		},
		onSuccess:
			config?.invalidates && config.queryClient
				? () => {
						for (const key of config.invalidates ?? []) {
							void config.queryClient?.invalidateQueries({ queryKey: key });
						}
					}
				: undefined,
	};
}
