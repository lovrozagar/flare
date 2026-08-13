/**
 * Middleware System - Public API
 *
 * Types and helpers for creating middlewares.
 */

type MiddlewareResultNext = { type: "next" }
type MiddlewareResultRespond = { response: Response; type: "respond" }
type MiddlewareResultBypass = { response: Response; type: "bypass" }

type MiddlewareResult = MiddlewareResultBypass | MiddlewareResultNext | MiddlewareResultRespond

type ResponseHandler = (response: Response) => Response | Promise<Response>

/**
 * Cloudflare Workers ExecutionContext
 */
interface ExecutionContext {
	passThroughOnException: () => void
	waitUntil: (promise: Promise<unknown>) => void
}

/**
 * Server request context store - set/get values that flow to loaders
 */
interface ServerRequestContextStore {
	get: <T = unknown>(key: string) => T | undefined
	set: <T = unknown>(key: string, value: T) => void
}

interface MiddlewareContext<TEnv = unknown> {
	applyResponseHandlers: (response: Response) => Promise<Response>
	env: TEnv
	executionContext: ExecutionContext
	nonce: string
	onResponse: (handler: ResponseHandler) => void
	request: Request
	serverRequestContext: ServerRequestContextStore
	url: URL
}

type FlareMiddleware<TEnv = unknown> = (
	ctx: MiddlewareContext<TEnv>,
	next: () => Promise<MiddlewareResult>,
) => Promise<MiddlewareResult>

function middlewareNext(): MiddlewareResult {
	return { type: "next" }
}

function middlewareRespond(response: Response): MiddlewareResult {
	return { response, type: "respond" }
}

function middlewareBypass(response: Response): MiddlewareResult {
	return { response, type: "bypass" }
}

export type {
	ExecutionContext,
	FlareMiddleware,
	MiddlewareContext,
	MiddlewareResult,
	MiddlewareResultBypass,
	MiddlewareResultNext,
	MiddlewareResultRespond,
	ResponseHandler,
	ServerRequestContextStore,
}

export { middlewareBypass, middlewareNext, middlewareRespond }
