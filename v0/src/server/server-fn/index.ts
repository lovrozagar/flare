/**
 * Server Functions
 *
 * Type-safe RPC with CSRF protection. Runs only on server.
 * Builder pattern: createServerFn → authenticate → input → authorize → handler
 */

import type { Auth } from "../../router/_internal/types"

type HttpMethod = "delete" | "get" | "patch" | "post" | "put"

interface ServerFnConfig {
	method: HttpMethod
	name?: string
}

interface HandlerContext<TAuth, TInput, TEnv> {
	auth: TAuth
	env: TEnv
	input: TInput
	request: Request
}

interface AuthorizeContext<TAuth, TInput> {
	auth: TAuth
	input: TInput
}

type ZodLike<T> = { _output: T } | { parse: (raw: unknown) => T }

interface QueryOptions<TOutput> {
	queryFn: () => Promise<TOutput>
	queryKey: unknown[]
}

interface MutationOptions<TInput, TOutput> {
	mutationFn: (input: TInput) => Promise<TOutput>
	mutationKey: unknown[]
}

/**
 * Server function result - callable with TanStack Query helpers
 */
interface ServerFn<TInput, TOutput> {
	(input: TInput): Promise<TOutput>
	key: (input: TInput) => unknown[]
	mutationOptions: () => MutationOptions<TInput, TOutput>
	queryOptions: (input: TInput) => QueryOptions<TOutput>
}

/**
 * Internal metadata stored on the function
 */
interface ServerFnInternalMetadata {
	authenticate: boolean
	authorize?: (ctx: AuthorizeContext<unknown, unknown>) => boolean | Promise<boolean>
	endpoint: string
	handler?: (ctx: HandlerContext<unknown, unknown, unknown>) => Promise<unknown>
	inputSchema?: ZodLike<unknown>
	method: HttpMethod
	name: string
}

/**
 * Generate unique hash for server function endpoint
 */
function generateFnHash(name: string, method: HttpMethod): string {
	let hash = 0
	const str = `${method}:${name}`
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i)
		hash = (hash << 5) - hash + char
		hash = hash & hash
	}
	return Math.abs(hash).toString(36).slice(0, 8)
}

/**
 * Build the final server function
 */
function buildServerFn<TInput, TOutput>(
	method: HttpMethod,
	name: string,
	authenticate: boolean,
	inputSchema: ZodLike<unknown> | undefined,
	authorize: ((ctx: AuthorizeContext<unknown, unknown>) => boolean | Promise<boolean>) | undefined,
	handler: (ctx: HandlerContext<unknown, unknown, unknown>) => Promise<unknown>,
): ServerFn<TInput, TOutput> {
	const fnHash = generateFnHash(name, method)
	const endpoint = `/_fn/${fnHash}/${name}`

	const fn = async (input: TInput): Promise<TOutput> => {
		const response = await fetch(endpoint, {
			body: input !== undefined ? JSON.stringify(input) : undefined,
			headers: {
				"Content-Type": "application/json",
			},
			method: method.toUpperCase(),
		})

		if (!response.ok) {
			const error = await response.json().catch(() => ({ message: "Request failed" }))
			throw new Error((error as { message?: string }).message ?? "Request failed")
		}

		return response.json() as Promise<TOutput>
	}

	fn.key = (input: TInput): unknown[] => {
		return [endpoint, input]
	}

	fn.queryOptions = (input: TInput): QueryOptions<TOutput> => {
		return {
			queryFn: () => fn(input),
			queryKey: fn.key(input),
		}
	}

	fn.mutationOptions = (): MutationOptions<TInput, TOutput> => {
		return {
			mutationFn: fn,
			mutationKey: [endpoint],
		}
	}

	const metadata: ServerFnInternalMetadata = {
		authenticate,
		authorize,
		endpoint,
		handler,
		inputSchema,
		method,
		name,
	}

	Object.defineProperty(fn, "_serverFn", {
		configurable: false,
		enumerable: false,
		value: metadata,
		writable: false,
	})

	return fn
}

/* Builder interfaces */

interface ServerFnBuilder<TEnv> {
	authenticate: () => ServerFnBuilderAuthenticated<TEnv>
	handler: <TOutput>(
		fn: (ctx: HandlerContext<null, undefined, TEnv>) => Promise<TOutput>,
	) => ServerFn<undefined, TOutput>
	input: <TInput>(schema: ZodLike<TInput>) => ServerFnBuilderWithInput<null, TInput, TEnv>
}

interface ServerFnBuilderAuthenticated<TEnv> {
	handler: <TOutput>(
		fn: (ctx: HandlerContext<Auth, undefined, TEnv>) => Promise<TOutput>,
	) => ServerFn<undefined, TOutput>
	input: <TInput>(schema: ZodLike<TInput>) => ServerFnBuilderWithInput<Auth, TInput, TEnv>
}

interface ServerFnBuilderWithInput<TAuth, TInput, TEnv> {
	authorize: (
		fn: (ctx: AuthorizeContext<TAuth, TInput>) => boolean | Promise<boolean>,
	) => ServerFnBuilderWithAuthorize<TAuth, TInput, TEnv>
	handler: <TOutput>(
		fn: (ctx: HandlerContext<TAuth, TInput, TEnv>) => Promise<TOutput>,
	) => ServerFn<TInput, TOutput>
}

interface ServerFnBuilderWithAuthorize<TAuth, TInput, TEnv> {
	handler: <TOutput>(
		fn: (ctx: HandlerContext<TAuth, TInput, TEnv>) => Promise<TOutput>,
	) => ServerFn<TInput, TOutput>
}

/**
 * Create a server function with builder pattern
 */
function createServerFn<TEnv = unknown>(config: ServerFnConfig): ServerFnBuilder<TEnv> {
	const method = config.method
	const name = config.name ?? "fn"

	return {
		authenticate: () => ({
			handler: <TOutput>(fn: (ctx: HandlerContext<Auth, undefined, TEnv>) => Promise<TOutput>) =>
				buildServerFn<undefined, TOutput>(
					method,
					name,
					true,
					undefined,
					undefined,
					fn as (ctx: HandlerContext<unknown, unknown, unknown>) => Promise<unknown>,
				),
			input: <TInput>(schema: ZodLike<TInput>) => ({
				authorize: (
					authFn: (ctx: AuthorizeContext<Auth, TInput>) => boolean | Promise<boolean>,
				) => ({
					handler: <TOutput>(
						handlerFn: (ctx: HandlerContext<Auth, TInput, TEnv>) => Promise<TOutput>,
					) =>
						buildServerFn<TInput, TOutput>(
							method,
							name,
							true,
							schema as ZodLike<unknown>,
							authFn as (ctx: AuthorizeContext<unknown, unknown>) => boolean | Promise<boolean>,
							handlerFn as (ctx: HandlerContext<unknown, unknown, unknown>) => Promise<unknown>,
						),
				}),
				handler: <TOutput>(fn: (ctx: HandlerContext<Auth, TInput, TEnv>) => Promise<TOutput>) =>
					buildServerFn<TInput, TOutput>(
						method,
						name,
						true,
						schema as ZodLike<unknown>,
						undefined,
						fn as (ctx: HandlerContext<unknown, unknown, unknown>) => Promise<unknown>,
					),
			}),
		}),
		handler: <TOutput>(fn: (ctx: HandlerContext<null, undefined, TEnv>) => Promise<TOutput>) =>
			buildServerFn<undefined, TOutput>(
				method,
				name,
				false,
				undefined,
				undefined,
				fn as (ctx: HandlerContext<unknown, unknown, unknown>) => Promise<unknown>,
			),
		input: <TInput>(schema: ZodLike<TInput>) => ({
			authorize: (authFn: (ctx: AuthorizeContext<null, TInput>) => boolean | Promise<boolean>) => ({
				handler: <TOutput>(
					handlerFn: (ctx: HandlerContext<null, TInput, TEnv>) => Promise<TOutput>,
				) =>
					buildServerFn<TInput, TOutput>(
						method,
						name,
						false,
						schema as ZodLike<unknown>,
						authFn as (ctx: AuthorizeContext<unknown, unknown>) => boolean | Promise<boolean>,
						handlerFn as (ctx: HandlerContext<unknown, unknown, unknown>) => Promise<unknown>,
					),
			}),
			handler: <TOutput>(fn: (ctx: HandlerContext<null, TInput, TEnv>) => Promise<TOutput>) =>
				buildServerFn<TInput, TOutput>(
					method,
					name,
					false,
					schema as ZodLike<unknown>,
					undefined,
					fn as (ctx: HandlerContext<unknown, unknown, unknown>) => Promise<unknown>,
				),
		}),
	}
}

/**
 * Check if value is a server function
 */
function isServerFn(value: unknown): value is ServerFn<unknown, unknown> {
	return (
		typeof value === "function" &&
		"_serverFn" in value &&
		typeof (value as { _serverFn: unknown })._serverFn === "object"
	)
}

/**
 * Get server function metadata
 */
interface ServerFnMetadata<TInput = unknown> {
	authenticate: boolean
	authorize?: (ctx: AuthorizeContext<unknown, TInput>) => boolean | Promise<boolean>
	endpoint: string
	handler?: (ctx: HandlerContext<unknown, TInput, unknown>) => Promise<unknown>
	inputSchema?: ZodLike<TInput>
	method: HttpMethod
	name: string
}

function getServerFnMetadata<TInput>(
	fn: ServerFn<TInput, unknown>,
): ServerFnMetadata<TInput> | null {
	if (!isServerFn(fn)) return null
	return (fn as unknown as { _serverFn: ServerFnMetadata<TInput> })._serverFn
}

export type {
	AuthorizeContext,
	HandlerContext,
	HttpMethod,
	MutationOptions,
	QueryOptions,
	ServerFn,
	ServerFnConfig,
	ServerFnMetadata,
}

export { createServerFn, generateFnHash, getServerFnMetadata, isServerFn }
