/**
 * Server Internal Types
 *
 * Types specific to server modules.
 * ExecutionContext matches Cloudflare Workers API.
 */

interface ExecutionContext {
	passThroughOnException: () => void
	waitUntil: (promise: Promise<unknown>) => void
}

export type { ExecutionContext }
