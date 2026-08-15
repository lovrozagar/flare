import type { FlattenedError } from "../errors/index.ts";
import {
	isNotFoundError,
	isRedirectResponse,
	isServerFnValidationError,
	isUnauthenticatedError,
	isUnauthorizedError,
	ServerFnValidationError,
} from "../errors/index.ts";
import type { RevalidateFn, RevalidateOptions } from "../revalidation/index.ts";
import { createRevalidateFn } from "../revalidation/index.ts";
/* package self-reference: routes through `exports.browser` -> stub on client, real on server.
   Bypassing this with `../server-context/index.ts` would pull `node:async_hooks` into the
   client bundle (server-fn is reachable from <Form action={fn}> in route components). */
import {
	addRevalidatedTags,
	getRevalidatedTags,
	getRevalidationContext,
	getServerContext,
} from "@lovrozagar/flare/server-context";

import type { Validator } from "../validation/index.ts";
import { runValidator } from "../validation/index.ts";

export type { Validator } from "../validation/index.ts";

export interface ServerFnConfig {
	__id?: string;
	method?: "get" | "post";
	name: string;
}

export interface PiggybackedQuery {
	data: unknown;
	key: unknown[];
}

export interface HandlerContext<TAuth, TInput, TEnv = unknown> {
	auth: TAuth;
	env: TEnv;
	input: TInput;
	/**
	 * Populate a TanStack Query cache entry alongside the server function response.
	 * Data is sent in the response body and applied via `queryClient.setQueryData()`
	 * on the client, avoiding extra round-trips for related data.
	 *
	 * Request-scoped: each request gets its own collector. Discarded on handler error.
	 *
	 * @param key - TanStack Query key array (must match the client's `queryKey`)
	 * @param data - Serializable data to cache under the key
	 */
	piggyback: (key: unknown[], data: unknown) => void;
	request: Request;
	revalidate: RevalidateFn;
	serverContext: Record<string, unknown>;
}

export interface StreamContext<TAuth, TInput, TEnv = unknown> {
	auth: TAuth;
	env: TEnv;
	input: TInput;
	request: Request;
	serverContext: Record<string, unknown>;
	signal: AbortSignal;
}

export interface ServerFnRegistrationBase {
	authenticate: boolean;
	authorizeFn?: (ctx: { auth: unknown; input: unknown }) => boolean | Promise<boolean>;
	id: string;
	input?: Validator<unknown>;
	method: "get" | "post";
	name: string;
}

export interface ServerFnHandlerRegistration extends ServerFnRegistrationBase {
	fn: (ctx: HandlerContext<unknown, unknown>) => unknown | Promise<unknown>;
	stream?: false;
}

export interface ServerFnStreamRegistration extends ServerFnRegistrationBase {
	fn: (ctx: StreamContext<unknown, unknown>) => AsyncGenerator<unknown>;
	stream: true;
}

export type ServerFnRegistration = ServerFnHandlerRegistration | ServerFnStreamRegistration;

interface BuilderState {
	__id?: string;
	authenticate: boolean;
	authorizeFn?: (ctx: { auth: unknown; input: unknown }) => boolean | Promise<boolean>;
	input?: Validator<unknown>;
	method: "get" | "post";
	name: string;
}

interface ServerFnBuilderTerminal<TAuth, TInput, TOutput> {
	handler(fn: (ctx: HandlerContext<TAuth, TInput>) => TOutput | Promise<TOutput>): ServerFn<TInput, TOutput>;
	input<T>(validator: Validator<T>): ServerFnBuilderTerminal<TAuth, T, TOutput>;
	stream<TChunk>(fn: (ctx: StreamContext<TAuth, TInput>) => AsyncGenerator<TChunk>): StreamFn<TInput, TChunk>;
}

interface ServerFnBuilderAfterAuth<TAuth, TInput, TOutput> extends ServerFnBuilderTerminal<TAuth, TInput, TOutput> {
	authorize(
		fn: (ctx: { auth: TAuth; input: TInput }) => boolean | Promise<boolean>,
	): ServerFnBuilderTerminal<TAuth, TInput, TOutput>;
	input<T>(validator: Validator<T>): ServerFnBuilderAfterAuth<TAuth, T, TOutput>;
}

interface ServerFnBuilder<TAuth, TInput, TOutput> extends ServerFnBuilderAfterAuth<TAuth, TInput, TOutput> {
	authenticate(): ServerFnBuilderAfterAuth<unknown, TInput, TOutput>;
	input<T>(validator: Validator<T>): ServerFnBuilder<TAuth, T, TOutput>;
}

export type ServerFn<_TInput, TOutput> = ((_input: _TInput) => Promise<TOutput>) & {
	_registration?: ServerFnRegistration;
};

export type StreamFn<_TInput, TChunk> = ((
	_input: _TInput,
	options?: { signal?: AbortSignal },
) => AsyncIterable<TChunk>) & {
	_registration?: ServerFnRegistration;
};

function createBuilderTerminal<TAuth, TInput, TOutput>(
	state: BuilderState,
): ServerFnBuilderTerminal<TAuth, TInput, TOutput> {
	return {
		handler(fn) {
			const registration: ServerFnHandlerRegistration = {
				authenticate: state.authenticate,
				authorizeFn: state.authorizeFn,
				fn: fn as (ctx: HandlerContext<unknown, unknown>) => unknown | Promise<unknown>,
				id: state.__id && state.__id.length > 0 ? state.__id : state.name,
				input: state.input,
				method: state.method,
				name: state.name,
			};

			const serverFn: ServerFn<TInput, TOutput> = async (_input: TInput): Promise<TOutput> => {
				if (state.authenticate) {
					throw new Error(
						`Server fn "${state.name}" requires authentication and cannot be called directly. Use the HTTP endpoint instead.`,
					);
				}
				/* server-side direct invocation — validate input if validator configured */
				const validated = state.input ? ((await runValidator(state.input, _input)) as TInput) : _input;
				const revalidateFn = createRevalidateFn(getRevalidationContext());
				const wrappedRevalidate: RevalidateFn = async (options: RevalidateOptions) => {
					await revalidateFn(options);
					if (options.tags && options.tags.length > 0) {
						addRevalidatedTags(options.tags);
					}
				};
				return await fn({
					auth: null as TAuth,
					env: {},
					input: validated,
					piggyback: () => {},
					request: new Request("http://localhost"),
					revalidate: wrappedRevalidate,
					serverContext: getServerContext(),
				});
			};
			serverFn._registration = registration;
			return serverFn;
		},
		input<T>(validator: Validator<T>) {
			return createBuilderTerminal<TAuth, T, TOutput>({
				...state,
				input: validator as Validator<unknown>,
			});
		},
		stream<TChunk>(fn: (ctx: StreamContext<TAuth, TInput>) => AsyncGenerator<TChunk>): StreamFn<TInput, TChunk> {
			const registration: ServerFnStreamRegistration = {
				authenticate: state.authenticate,
				authorizeFn: state.authorizeFn,
				fn: fn as (ctx: StreamContext<unknown, unknown>) => AsyncGenerator<unknown>,
				id: state.__id && state.__id.length > 0 ? state.__id : state.name,
				input: state.input,
				method: state.method,
				name: state.name,
				stream: true,
			};

			const streamFn: StreamFn<TInput, TChunk> = (
				_input: TInput,
				options?: { signal?: AbortSignal },
			): AsyncIterable<TChunk> => {
				const signal = options?.signal ?? new AbortController().signal;
				if (state.authenticate) {
					throw new Error(
						`Server fn "${state.name}" requires authentication and cannot be called directly. Use the HTTP endpoint instead.`,
					);
				}
				/* validate once, lazily create generator on first .next() */
				const validatedPromise = state.input ? runValidator(state.input, _input) : Promise.resolve(_input);
				return {
					[Symbol.asyncIterator]() {
						let generator: AsyncGenerator<TChunk> | undefined;
						return {
							async next() {
								if (!generator) {
									const validated = (await validatedPromise) as TInput;
									generator = fn({
										auth: null as TAuth,
										env: {} as unknown,
										input: validated,
										request: new Request("http://localhost"),
										serverContext: getServerContext(),
										signal,
									});
								}
								return generator.next();
							},
							return(value?: TChunk) {
								return generator?.return(value) ?? Promise.resolve({ done: true as const, value: undefined as TChunk });
							},
							throw(e?: unknown) {
								return generator?.throw(e) ?? Promise.resolve({ done: true as const, value: undefined as TChunk });
							},
						};
					},
				};
			};
			streamFn._registration = registration;
			return streamFn;
		},
	};
}

function createBuilderAfterAuth<TAuth, TInput, TOutput>(
	state: BuilderState,
): ServerFnBuilderAfterAuth<TAuth, TInput, TOutput> {
	return {
		...createBuilderTerminal<TAuth, TInput, TOutput>(state),
		authorize(fn) {
			return createBuilderTerminal<TAuth, TInput, TOutput>({
				...state,
				authorizeFn: fn as (ctx: { auth: unknown; input: unknown }) => boolean | Promise<boolean>,
			});
		},
		input<T>(validator: Validator<T>) {
			return createBuilderAfterAuth<TAuth, T, TOutput>({
				...state,
				input: validator as Validator<unknown>,
			});
		},
	};
}

function createBuilder<TAuth, TInput, TOutput>(state: BuilderState): ServerFnBuilder<TAuth, TInput, TOutput> {
	return {
		...createBuilderAfterAuth<TAuth, TInput, TOutput>(state),
		authenticate() {
			return createBuilderAfterAuth<unknown, TInput, TOutput>({
				...state,
				authenticate: true,
			});
		},
		input<T>(validator: Validator<T>) {
			return createBuilder<TAuth, T, TOutput>({
				...state,
				input: validator as Validator<unknown>,
			});
		},
	};
}

export function createServerFn(config: ServerFnConfig): ServerFnBuilder<null, void, unknown> {
	return createBuilder<null, void, unknown>({
		__id: config.__id,
		authenticate: false,
		method: config.method ?? "post",
		name: config.name,
	});
}

function jsonResponse(data: unknown, status: number): Response {
	return new Response(JSON.stringify(data), {
		headers: { "content-type": "application/json; charset=utf-8" },
		status,
	});
}

/* ── CSRF Origin validation ────────────────────────────────────────── */

/**
 * Validate that the request Origin header matches the request URL origin.
 * Browsers always send Origin on POST; some browsers omit it on GET.
 * When Origin is present (any method), validate it — cross-origin GET
 * server function calls are just as dangerous as POST for CSRF.
 * Missing Origin is allowed since CSRF is a browser-only attack vector
 * and non-browser clients (curl, etc) won't have cookies.
 */
function validateOrigin(request: Request): boolean {
	const origin = request.headers.get("origin");
	if (!origin) return true;

	const requestOrigin = new URL(request.url).origin;
	return origin === requestOrigin;
}

/* ── formDataToObject ───────────────────────────────────────────────── */

export function formDataToObject(formData: FormData): Record<string, File | string | string[]> {
	const obj: Record<string, File | string | string[]> = Object.create(null);
	for (const [key, val] of formData) {
		if (key === "__flare_fn" || key === "__proto__" || key === "constructor" || key === "prototype") continue;
		if (val instanceof File) {
			obj[key] = val;
			continue;
		}
		const existing = obj[key];
		if (typeof existing === "string") {
			obj[key] = [existing, val];
		} else if (Array.isArray(existing)) {
			existing.push(val);
		} else {
			obj[key] = val;
		}
	}
	return obj;
}

export async function handleServerFnRequest(
	request: Request,
	env: unknown,
	fns: Map<string, ServerFnRegistration>,
	authenticateFn?: (env: unknown, request: Request) => unknown | Promise<unknown>,
): Promise<Response> {
	/* parse URL: /_fn/{id}/{name} */
	const url = new URL(request.url);
	const segments = url.pathname.split("/").filter(Boolean);
	/* segments: ["_fn", id, name] */
	if (segments.length < 3 || segments[0] !== "_fn") {
		return jsonResponse({ message: "Server function not found" }, 404);
	}

	const id = segments[1];
	const name = segments[2];

	if (!id || !name) {
		return jsonResponse({ message: "Server function not found" }, 404);
	}

	/* CSRF: validate Origin before any processing */
	if (!validateOrigin(request)) {
		return jsonResponse({ message: "Origin mismatch" }, 403);
	}

	/* lookup */
	const registration = fns.get(id);
	if (!registration || registration.name !== name) {
		return jsonResponse({ message: "Server function not found" }, 404);
	}

	/* method validation */
	if (request.method.toLowerCase() !== registration.method) {
		return jsonResponse({ message: "Method not allowed" }, 405);
	}

	try {
		/* authentication */
		let auth: unknown = null;
		if (registration.authenticate) {
			if (!authenticateFn) {
				return jsonResponse({ message: "Unauthorized" }, 401);
			}
			auth = await authenticateFn(env, request);
			if (auth === null || auth === undefined) {
				return jsonResponse({ message: "Unauthorized" }, 401);
			}
		}

		/* parse input — FormData for form submissions, JSON for programmatic calls */
		let input: unknown;
		if (registration.method === "post") {
			const contentType = request.headers.get("content-type") ?? "";
			if (contentType.includes("multipart/form-data") || contentType.includes("x-www-form-urlencoded")) {
				input = formDataToObject(await request.formData());
			} else {
				const text = await request.text();
				if (text) {
					try {
						input = JSON.parse(text);
					} catch {
						return jsonResponse({ message: "Invalid JSON" }, 400);
					}
				}
			}
		} else {
			const params = url.searchParams;
			const obj: Record<string, string | string[]> = Object.create(null);
			let hasParams = false;
			for (const [key, val] of params) {
				if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
				hasParams = true;
				const existing = obj[key];
				if (existing !== undefined) {
					obj[key] = Array.isArray(existing) ? [...existing, val] : [existing, val];
				} else {
					obj[key] = val;
				}
			}
			if (hasParams) {
				input = obj;
			}
		}

		/* validate input — ServerFnValidationError propagates to outer catch for structured errors */
		if (registration.input) {
			try {
				input = await runValidator(registration.input, input);
			} catch (e) {
				if (isServerFnValidationError(e)) throw e;
				const message = e instanceof Error ? e.message : "Validation failed";
				return jsonResponse({ message }, 400);
			}
		}

		/* authorize */
		if (registration.authorizeFn) {
			const allowed = await registration.authorizeFn({ auth, input });
			if (!allowed) {
				return jsonResponse({ message: "Forbidden" }, 403);
			}
		}

		/* streaming handler */
		if (registration.stream) {
			const abortController = new AbortController();
			const iterator = registration.fn({
				auth,
				env,
				input,
				request,
				serverContext: getServerContext(),
				signal: abortController.signal,
			});
			const encoder = new TextEncoder();
			let cleaned = false;

			const stream = new ReadableStream({
				cancel() {
					abortController.abort();
					if (!cleaned) {
						cleaned = true;
						iterator.return(undefined).catch(() => {});
					}
				},
				async pull(controller) {
					try {
						const { done, value } = await iterator.next();
						if (done) {
							controller.enqueue(encoder.encode(`${JSON.stringify({ d: true })}\n`));
							controller.close();
							if (!cleaned) {
								cleaned = true;
								await iterator.return(undefined).catch(() => {});
							}
							return;
						}
						controller.enqueue(encoder.encode(`${JSON.stringify({ c: value ?? null })}\n`));
					} catch (e) {
						const message = e instanceof Error ? e.message : "Stream error";
						controller.enqueue(encoder.encode(`${JSON.stringify({ e: { message } })}\n`));
						controller.close();
						abortController.abort();
						if (!cleaned) {
							cleaned = true;
							await iterator.return(undefined).catch(() => {});
						}
					}
				},
			});

			return new Response(stream, {
				headers: { "content-type": "text/x-ndjson" },
			});
		}

		/* execute handler with piggyback collector */
		const piggybacked: PiggybackedQuery[] = [];
		const piggyback = (key: unknown[], data: unknown) => {
			piggybacked.push({ data, key });
		};
		const revalidateFn = createRevalidateFn(getRevalidationContext());
		const wrappedRevalidate: RevalidateFn = async (options: RevalidateOptions) => {
			await revalidateFn(options);
			if (options.tags && options.tags.length > 0) {
				addRevalidatedTags(options.tags);
			}
		};
		const result = await registration.fn({
			auth,
			env,
			input,
			piggyback,
			request,
			revalidate: wrappedRevalidate,
			serverContext: getServerContext(),
		});
		const response: Record<string, unknown> = { data: result ?? null };
		if (piggybacked.length > 0) {
			response.queries = piggybacked;
		}
		const revalidatedTags = getRevalidatedTags();
		if (revalidatedTags.length > 0) {
			response.revalidatedTags = revalidatedTags;
		}
		return jsonResponse(response, 200);
	} catch (e) {
		if (isRedirectResponse(e)) throw e;
		/* Pass-through for HTTP-shaped errors (e.g. SDK ClientError carrying upstream Response).
		   Handler can throw a Response directly, or any error object whose `.response` is a Response,
		   and the upstream status + body propagate to the caller verbatim — no envelope rewrap. */
		if (e instanceof Response) return e.clone();
		if (
			typeof e === "object" &&
			e !== null &&
			"response" in e &&
			(e as { response: unknown }).response instanceof Response
		) {
			return (e as { response: Response }).response.clone();
		}
		if (isServerFnValidationError(e)) {
			return jsonResponse({ errors: e.errors, message: e.message }, 400);
		}
		if (isUnauthenticatedError(e)) {
			return jsonResponse({ message: e.message }, 401);
		}
		if (isUnauthorizedError(e)) {
			return jsonResponse({ message: e.message }, 403);
		}
		if (isNotFoundError(e)) {
			return jsonResponse({ message: e.message }, 404);
		}
		/* Surface the real error in the dev terminal — without this, the catch-all 500 returns a
		   generic message and the actual failure (gateway 4xx/5xx, missing binding, etc.) is invisible. */
		const errMsg = e instanceof Error ? (e.stack ?? e.message) : String(e);
		console.error(`[flare:server-fn] unhandled error in handler:\n${errMsg}`);
		return jsonResponse({ message: "Internal server error" }, 500);
	}
}

/* ── serverFnQueryOptions ────────────────────────────────────────────── */

interface ServerFnQueryConfig<TInput, _TOutput> {
	input?: TInput;
	onRevalidate?: (tags: string[]) => void;
	queryClient?: QueryClientLike;
	queryKey?: unknown[];
	staleTime?: number;
}

interface QueryClientLike {
	invalidateQueries(options: { queryKey: unknown[] }): Promise<void>;
	setQueryData(key: unknown[], data: unknown): unknown;
}

export function serverFnQueryOptions<TInput, TOutput>(
	serverFn: ServerFn<TInput, TOutput>,
	config?: ServerFnQueryConfig<TInput, TOutput>,
): { queryFn: () => Promise<TOutput>; queryKey: unknown[]; staleTime?: number } {
	const reg = serverFn._registration;
	const name = reg?.name ?? "unknown";
	const id = reg?.id ?? name;
	const queryKey = config?.queryKey ?? [name, config?.input];

	return {
		queryFn: async () => {
			/* server: direct call */
			if (typeof window === "undefined") {
				return serverFn(config?.input as TInput);
			}

			/* client: HTTP fetch */
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
				if (typeof body === "object" && body !== null && "errors" in body) {
					throw new ServerFnValidationError((body as { errors: FlattenedError }).errors);
				}
				const errMsg =
					typeof body === "object" && body !== null && "message" in body
						? String((body as Record<string, unknown>).message)
						: `Request failed (${res.status})`;
				throw new Error(`Server function "${name}" failed: ${errMsg}`);
			}

			const json = (await res.json()) as {
				data: TOutput;
				queries?: Array<{ data: unknown; key: unknown[] }>;
				revalidatedTags?: string[];
			};

			/* apply piggybacked queries to cache */
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

/* ── serverFnMutationOptions ─────────────────────────────────────────── */

interface ServerFnMutationConfig<_TOutput> {
	invalidates?: unknown[][];
	onRevalidate?: (tags: string[]) => void;
	queryClient?: QueryClientLike;
}

export function serverFnMutationOptions<TInput, TOutput>(
	serverFn: ServerFn<TInput, TOutput>,
	config?: ServerFnMutationConfig<TOutput>,
): {
	mutationFn: (input: TInput) => Promise<TOutput>;
	onSuccess?: () => void;
} {
	const reg = serverFn._registration;
	const name = reg?.name ?? "unknown";
	const id = reg?.id ?? name;

	return {
		mutationFn: async (input: TInput) => {
			/* server: direct call */
			if (typeof window === "undefined") {
				return serverFn(input);
			}

			/* client: HTTP fetch — mutations always POST */
			const url = `/_fn/${id}/${name}`;
			const res = await fetch(url, {
				body: input !== undefined ? JSON.stringify(input) : undefined,
				headers: { "content-type": "application/json" },
				method: "POST",
			});

			if (!res.ok) {
				const body: unknown = await res.json().catch(() => null);
				if (typeof body === "object" && body !== null && "errors" in body) {
					throw new ServerFnValidationError((body as { errors: FlattenedError }).errors);
				}
				const errMsg =
					typeof body === "object" && body !== null && "message" in body
						? String((body as Record<string, unknown>).message)
						: `Request failed (${res.status})`;
				throw new Error(`Server function "${name}" failed: ${errMsg}`);
			}

			const json = (await res.json()) as {
				data: TOutput;
				queries?: Array<{ data: unknown; key: unknown[] }>;
				revalidatedTags?: string[];
			};

			/* apply piggybacked queries to cache */
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
