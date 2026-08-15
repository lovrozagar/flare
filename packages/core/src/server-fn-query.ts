/**
 * Client-safe query/mutation option helpers for server functions.
 * This module must NOT import from ./server-fn/index.ts or ./server-context
 * to avoid pulling in node:async_hooks on the client.
 */

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

			const url = `/_fn/${id}/${name}`;
			const method = reg?.method ?? "post";

			const res =
				method === "get"
					? await fetch(
							config?.input !== undefined
								? `${url}?${new URLSearchParams(config.input as Record<string, string>)}`
								: url,
						)
					: await fetch(url, {
							body: config?.input !== undefined ? JSON.stringify(config.input) : undefined,
							headers: { "content-type": "application/json" },
							method: "POST",
						});

			if (!res.ok) {
				const body: unknown = await res.json().catch(() => null);
				const errMsg =
					typeof body === "object" && body !== null && "message" in body
						? String((body as Record<string, unknown>).message)
						: `Request failed (${res.status})`;
				throw new Error(`Server function request failed: ${errMsg}`);
			}

			const json = (await res.json()) as {
				data: TOutput;
				queries?: Array<{ data: unknown; key: unknown[] }>;
				revalidatedTags?: string[];
			};

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

			const url = `/_fn/${id}/${name}`;
			const res = await fetch(url, {
				body: input !== undefined ? JSON.stringify(input) : undefined,
				headers: { "content-type": "application/json" },
				method: "POST",
			});

			if (!res.ok) {
				const body: unknown = await res.json().catch(() => null);
				const errMsg =
					typeof body === "object" && body !== null && "message" in body
						? String((body as Record<string, unknown>).message)
						: `Request failed (${res.status})`;
				throw new Error(`Server function request failed: ${errMsg}`);
			}

			const json = (await res.json()) as {
				data: TOutput;
				queries?: Array<{ data: unknown; key: unknown[] }>;
				revalidatedTags?: string[];
			};

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
