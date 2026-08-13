/**
 * Browser stub for `flare/server-context`. Resolved via package.json `exports.browser`
 * condition. Server-context wraps `node:async_hooks` AsyncLocalStorage — Node-only API. Vite's
 * browser shim throws on `node:*` import access, so the real module cannot load on the client
 * even when its functions are unreachable. This stub exposes the same surface with throwing
 * implementations + no Node imports, keeping `node:async_hooks` out of the client bundle entirely.
 *
 * If any of these functions actually run in the browser, that is a real bug in the consumer —
 * they should be guarded by `import.meta.env.SSR` or live inside a stripped server-fn handler.
 */

import type { CdnPurgeAdapter } from "../revalidation/index.ts"
import type { FlareStore } from "../store/index.ts"

export interface ServerLogEntry {
	a: unknown[]
	l: "error" | "log" | "warn"
	s?: string
}

export interface ServerRequestContextStore {
	get<T>(key: string): T | undefined
	set<K extends string, V>(key: K, value: V): void
}

export interface RunWithServerContextOptions {
	cdnPurgeAdapter?: CdnPurgeAdapter
	isDev?: boolean
	nonce: string
	request: Request
	serverContext?: Record<string, unknown>
	store?: FlareStore
	waitUntil?: (promise: Promise<unknown>) => void
}

const ERR = "Flare server-context API called in the browser. Move call into a server-fn handler or guard with import.meta.env.SSR."

function unreachable(): never {
	throw new Error(ERR)
}

export function generateNonce(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16))
	let hex = ""
	for (const b of bytes) {
		hex += b.toString(16).padStart(2, "0")
	}
	return hex
}

export function runWithServerContext<T>(_opts: RunWithServerContextOptions, _cb: () => T): T {
	return unreachable()
}

export function getServerNonce(): string {
	return ""
}

export function setServerNonce(_nonce: string): void {
	unreachable()
}

export function getServerRequest(): Request {
	return unreachable()
}

export function getServerRequestContext(): ServerRequestContextStore {
	return unreachable()
}

export function getServerContext<T extends Record<string, unknown> = Record<string, unknown>>(): T {
	return unreachable() as T
}

export function getRevalidationContext(): {
	cdnPurgeAdapter?: CdnPurgeAdapter
	store?: FlareStore
} {
	return {}
}

export function addRevalidatedTags(_tags: string[]): void {
	/* no-op on browser — revalidation is server-only */
}

export function getRevalidatedTags(): string[] {
	return []
}

export function serverLog(_level: "error" | "log" | "warn", ..._args: unknown[]): void {
	/* no-op on browser */
}

export function getServerLogs(): ServerLogEntry[] {
	return []
}

export function background(_promise: Promise<unknown>): void {
	/* no-op on browser */
}

export interface FormActionContext {
	[key: string]: unknown
}

export function setFormActionContext(_fnId: string, _ctx: FormActionContext): void {
	unreachable()
}

export function getFormActionContext(_fnId: string): FormActionContext | undefined {
	return undefined
}
