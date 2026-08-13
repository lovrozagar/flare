/**
 * Server Function Handler
 *
 * Processes /_fn/* requests on the server.
 * Validates input, runs authorize/authenticate, calls handler.
 */

import { ForbiddenError, ServerFnValidationError, UnauthenticatedError } from "../../errors"
import type { Auth } from "../../router/_internal/types"
import type { ServerFn } from "./index"
import { getServerFnMetadata, isServerFn } from "./index"

interface AuthenticateFnContext<TEnv> {
	env: TEnv
	request: Request
	url: URL
}

interface ServerFnHandlerConfig<TEnv> {
	authenticateFn?: (ctx: AuthenticateFnContext<TEnv>) => Promise<Auth | null>
	env: TEnv
	request: Request
}

type ServerFnRegistry = Record<string, ServerFn<any, any>>

/**
 * Create a registry of server functions for lookup
 */
function createServerFnRegistry(functions: Record<string, unknown>): ServerFnRegistry {
	const registry: ServerFnRegistry = {}

	for (const [, value] of Object.entries(functions)) {
		if (isServerFn(value)) {
			const metadata = getServerFnMetadata(value)
			if (metadata) {
				registry[metadata.endpoint] = value
			}
		}
	}

	return registry
}

/**
 * Handle a server function request
 */
async function handleServerFnRequest<TEnv>(
	registry: ServerFnRegistry,
	config: ServerFnHandlerConfig<TEnv>,
): Promise<Response> {
	const { env, request } = config
	const url = new URL(request.url)

	/* Find matching server function */
	const fn = registry[url.pathname]
	if (!fn) {
		return new Response(JSON.stringify({ message: "Not found" }), {
			headers: { "Content-Type": "application/json" },
			status: 404,
		})
	}

	const metadata = getServerFnMetadata(fn)
	if (!metadata) {
		return new Response(JSON.stringify({ message: "Invalid server function" }), {
			headers: { "Content-Type": "application/json" },
			status: 500,
		})
	}

	/* Validate HTTP method */
	if (request.method.toLowerCase() !== metadata.method) {
		return new Response(JSON.stringify({ message: "Method not allowed" }), {
			headers: { "Content-Type": "application/json" },
			status: 405,
		})
	}

	try {
		/* Authenticate if required */
		let auth: Auth | null = null
		if (metadata.authenticate) {
			if (!config.authenticateFn) {
				throw new UnauthenticatedError("Authentication required but no authenticateFn configured")
			}
			auth = await config.authenticateFn({ env, request, url })
			if (!auth) {
				throw new UnauthenticatedError("Authentication required")
			}
		}

		/* Parse and validate input */
		let input: unknown
		if (metadata.inputSchema) {
			const body = await request.text()
			const rawInput = body ? JSON.parse(body) : undefined

			if ("parse" in metadata.inputSchema) {
				try {
					input = metadata.inputSchema.parse(rawInput)
				} catch (error) {
					throw new ServerFnValidationError({
						fieldErrors: {},
						formErrors: [error instanceof Error ? error.message : "Validation failed"],
					})
				}
			} else {
				input = rawInput
			}
		}

		/* Run authorize if defined */
		if (metadata.authorize) {
			const authorized = await metadata.authorize({ auth, input })
			if (!authorized) {
				throw new ForbiddenError("Not authorized")
			}
		}

		/* Call handler */
		if (!metadata.handler) {
			return new Response(JSON.stringify({ message: "No handler defined" }), {
				headers: { "Content-Type": "application/json" },
				status: 500,
			})
		}

		const result = await metadata.handler({
			auth,
			env,
			input,
			request,
		})

		return new Response(JSON.stringify(result), {
			headers: { "Content-Type": "application/json" },
			status: 200,
		})
	} catch (error) {
		if (error instanceof ServerFnValidationError) {
			return new Response(JSON.stringify({ message: error.message }), {
				headers: { "Content-Type": "application/json" },
				status: 400,
			})
		}

		if (error instanceof UnauthenticatedError) {
			return new Response(JSON.stringify({ message: error.message }), {
				headers: { "Content-Type": "application/json" },
				status: 401,
			})
		}

		if (error instanceof ForbiddenError) {
			return new Response(JSON.stringify({ message: error.message }), {
				headers: { "Content-Type": "application/json" },
				status: 403,
			})
		}

		/* Generic error */
		const message = error instanceof Error ? error.message : "Internal server error"
		return new Response(JSON.stringify({ message }), {
			headers: { "Content-Type": "application/json" },
			status: 500,
		})
	}
}

/**
 * Check if a request is for a server function
 */
function isServerFnRequest(request: Request): boolean {
	const url = new URL(request.url)
	return url.pathname.startsWith("/_fn/")
}

export type { ServerFnHandlerConfig, ServerFnRegistry }
export { createServerFnRegistry, handleServerFnRequest, isServerFnRequest }
