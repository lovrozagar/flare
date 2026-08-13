/**
 * Middleware Runner - Internal
 *
 * Internal middleware execution and context creation.
 * Not part of public API.
 */

import {
	createServerRequestContext,
	type ServerRequestContextStore,
} from "../context/request-context"
import type { ExecutionContext } from "./types"

type MiddlewareResultNext = { type: "next" }
type MiddlewareResultRespond = { response: Response; type: "respond" }
type MiddlewareResultBypass = { response: Response; type: "bypass" }

type MiddlewareResult = MiddlewareResultBypass | MiddlewareResultNext | MiddlewareResultRespond

type ResponseHandler = (response: Response) => Response | Promise<Response>

interface MiddlewareContext<TEnv = unknown> {
	applyResponseHandlers: (response: Response) => Promise<Response>
	env: TEnv
	executionContext?: ExecutionContext
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

interface CreateMiddlewareContextOptions<TEnv = unknown> {
	env: TEnv
	executionContext?: ExecutionContext
	nonce: string
	request: Request
	url: URL
}

function createMiddlewareContext<TEnv = unknown>(
	options: CreateMiddlewareContextOptions<TEnv>,
): MiddlewareContext<TEnv> {
	const responseHandlers: ResponseHandler[] = []
	const serverRequestContext = createServerRequestContext()

	return {
		applyResponseHandlers: async (response: Response): Promise<Response> => {
			let current = response
			for (const handler of responseHandlers) {
				current = await handler(current)
			}
			return current
		},
		env: options.env,
		executionContext: options.executionContext,
		nonce: options.nonce,
		onResponse: (handler: ResponseHandler) => {
			responseHandlers.push(handler)
		},
		request: options.request,
		serverRequestContext,
		url: options.url,
	}
}

function runMiddlewares<TEnv = unknown>(
	middlewares: FlareMiddleware<TEnv>[],
	ctx: MiddlewareContext<TEnv>,
): Promise<MiddlewareResult> {
	let index = 0

	const next = (): Promise<MiddlewareResult> => {
		if (index >= middlewares.length) {
			return Promise.resolve({ type: "next" })
		}

		const middleware = middlewares[index]
		if (!middleware) {
			return Promise.resolve({ type: "next" })
		}
		index++

		return middleware(ctx, next)
	}

	return next()
}

export type {
	CreateMiddlewareContextOptions,
	FlareMiddleware,
	MiddlewareContext,
	MiddlewareResult,
	MiddlewareResultBypass,
	MiddlewareResultNext,
	MiddlewareResultRespond,
	ResponseHandler,
}

export { createMiddlewareContext, runMiddlewares }
