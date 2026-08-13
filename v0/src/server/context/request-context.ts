/**
 * Server Request Context
 *
 * AsyncLocalStorage-based request context.
 * Provides isolated access to request, nonce, and custom context.
 */

import { AsyncLocalStorage } from "node:async_hooks"

interface ServerRequestContextStore {
	get<T>(key: string): T | undefined
	set<K extends string, V>(key: K, value: V): void
}

interface ServerContextValue {
	nonce: string
	request: Request
	store: Map<string, unknown>
}

const serverContext = new AsyncLocalStorage<ServerContextValue>()

function createServerRequestContext(): ServerRequestContextStore {
	const store = new Map<string, unknown>()
	return {
		get<T>(key: string): T | undefined {
			return store.get(key) as T | undefined
		},
		set<K extends string, V>(key: K, value: V): void {
			store.set(key, value)
		},
	}
}

interface RunWithServerContextOptions {
	nonce: string
	request: Request
}

function runWithServerContext<T>(options: RunWithServerContextOptions, callback: () => T): T {
	const value: ServerContextValue = {
		nonce: options.nonce,
		request: options.request,
		store: new Map(),
	}
	return serverContext.run(value, callback)
}

function getContext(): ServerContextValue {
	const ctx = serverContext.getStore()
	if (!ctx) {
		throw new Error("Called outside request context")
	}
	return ctx
}

function getServerRequest(): Request {
	try {
		return getContext().request
	} catch {
		throw new Error("getServerRequest called outside request context")
	}
}

function getServerNonce(): string {
	try {
		return getContext().nonce
	} catch {
		throw new Error("getServerNonce called outside request context")
	}
}

function getServerRequestContext<T = Record<string, unknown>>(): ServerRequestContextStore & T {
	let ctx: ServerContextValue
	try {
		ctx = getContext()
	} catch {
		throw new Error("getServerRequestContext called outside request context")
	}

	const store: ServerRequestContextStore = {
		get<V>(key: string): V | undefined {
			return ctx.store.get(key) as V | undefined
		},
		set<K extends string, V>(key: K, value: V): void {
			ctx.store.set(key, value)
		},
	}

	return store as ServerRequestContextStore & T
}

export type { RunWithServerContextOptions, ServerRequestContextStore }

export {
	createServerRequestContext,
	getServerNonce,
	getServerRequest,
	getServerRequestContext,
	runWithServerContext,
}
