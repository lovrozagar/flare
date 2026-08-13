import { AsyncLocalStorage } from "node:async_hooks"
import type { CdnPurgeAdapter } from "../revalidation/index.ts"
import type { FlareStore } from "../store/index.ts"

export interface ServerLogEntry {
	a: unknown[]
	l: "error" | "log" | "warn"
	/** Server-side source location (dev only) */
	s?: string
}

interface ServerContextValue {
	cdnPurgeAdapter?: CdnPurgeAdapter
	isDev?: boolean
	nonce: string
	request: Request
	requestStore: Map<string, unknown>
	serverContext: Record<string, unknown>
	store?: FlareStore
	waitUntil?: (promise: Promise<unknown>) => void
}

export interface ServerRequestContextStore {
	get<T>(key: string): T | undefined
	set<K extends string, V>(key: K, value: V): void
}

let storage: AsyncLocalStorage<ServerContextValue> | undefined

function getStorage(): AsyncLocalStorage<ServerContextValue> {
	if (!storage) {
		storage = new AsyncLocalStorage<ServerContextValue>()
	}
	return storage
}

function getContext(): ServerContextValue {
	const ctx = getStorage().getStore()
	if (!ctx) {
		throw new Error(
			"getServerContext() called outside request context. Must be called during request handling (route handler, middleware, or server function).",
		)
	}
	return ctx
}

export function generateNonce(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16))
	let hex = ""
	for (const b of bytes) {
		hex += b.toString(16).padStart(2, "0")
	}
	return hex
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

export function runWithServerContext<T>(
	options: RunWithServerContextOptions,
	callback: () => T,
): T {
	const value: ServerContextValue = {
		cdnPurgeAdapter: options.cdnPurgeAdapter,
		isDev: options.isDev,
		nonce: options.nonce,
		request: options.request,
		requestStore: new Map(),
		serverContext: options.serverContext ?? {},
		store: options.store,
		waitUntil: options.waitUntil,
	}
	return getStorage().run(value, callback)
}

export function getServerNonce(): string {
	return getContext().nonce
}

export function setServerNonce(nonce: string): void {
	getContext().nonce = nonce
}

export function getServerRequest(): Request {
	return getContext().request
}

export function getServerRequestContext(): ServerRequestContextStore {
	const ctx = getContext()
	return {
		get<T>(key: string): T | undefined {
			return ctx.requestStore.get(key) as T | undefined
		},
		set<K extends string, V>(key: K, value: V): void {
			ctx.requestStore.set(key, value)
		},
	}
}

const EMPTY_CONTEXT: Record<string, unknown> = Object.freeze(Object.create(null))

export function getServerContext<T extends Record<string, unknown> = Record<string, unknown>>(): T {
	const ctx = getStorage().getStore()
	if (!ctx) return EMPTY_CONTEXT as T
	return ctx.serverContext as T
}

export function getRevalidationContext(): {
	cdnPurgeAdapter?: CdnPurgeAdapter
	store?: FlareStore
} {
	const ctx = getStorage().getStore()
	if (!ctx) return {}
	return {
		cdnPurgeAdapter: ctx.cdnPurgeAdapter,
		store: ctx.store,
	}
}

const REVALIDATED_TAGS_KEY = "__flare_revalidated_tags"

export function addRevalidatedTags(tags: string[]): void {
	const ctx = getStorage().getStore()
	if (!ctx) return
	const existing = (ctx.requestStore.get(REVALIDATED_TAGS_KEY) as string[] | undefined) ?? []
	const merged = new Set(existing)
	for (const tag of tags) {
		merged.add(tag)
	}
	ctx.requestStore.set(REVALIDATED_TAGS_KEY, [...merged])
}

export function getRevalidatedTags(): string[] {
	const ctx = getStorage().getStore()
	if (!ctx) return []
	return (ctx.requestStore.get(REVALIDATED_TAGS_KEY) as string[] | undefined) ?? []
}

const SERVER_LOGS_KEY = "__flare_server_logs"
const MAX_SERVER_LOGS = 1000

const CALLER_RE = /\((.+):(\d+):\d+\)|at\s+(.+):(\d+):\d+/

function parseCallerLocation(): string | undefined {
	const stack = new Error().stack
	if (!stack) return undefined
	/* Frame 0 = Error, 1 = parseCallerLocation, 2 = serverLog, 3 = ctx.log/warn/error wrapper, 4 = user code */
	const frame = stack.split("\n")[4]
	if (!frame) return undefined
	const m = CALLER_RE.exec(frame)
	if (!m) return undefined
	const file = m[1] ?? m[3] ?? ""
	const line = m[2] ?? m[4] ?? ""
	/* Strip to relative path from src/ or routes/ */
	const srcIdx = file.lastIndexOf("/src/")
	const short = srcIdx >= 0 ? file.slice(srcIdx + 1) : file.split("/").slice(-2).join("/")
	return `${short}:${line}`
}

export function serverLog(level: "error" | "log" | "warn", ...args: unknown[]): void {
	const ctx = getStorage().getStore()
	if (!ctx) return
	const logs = (ctx.requestStore.get(SERVER_LOGS_KEY) as ServerLogEntry[] | undefined) ?? []
	if (logs.length >= MAX_SERVER_LOGS) return
	const entry: ServerLogEntry = { a: args, l: level }
	if (ctx.isDev) {
		const loc = parseCallerLocation()
		if (loc) entry.s = loc
	}
	logs.push(entry)
	ctx.requestStore.set(SERVER_LOGS_KEY, logs)
}

export function getServerLogs(): ServerLogEntry[] {
	const ctx = getStorage().getStore()
	if (!ctx) return []
	return (ctx.requestStore.get(SERVER_LOGS_KEY) as ServerLogEntry[] | undefined) ?? []
}

/* ── Form action context (PE POST error re-render) ─────────────────── */

export interface FormActionContext {
	fieldErrors: Record<string, string[]>
	formErrors: string[]
	message: string
	values: Record<string, unknown>
}

export function setFormActionContext(fnId: string, ctx: FormActionContext): void {
	const store = getStorage().getStore()
	if (!store) return
	store.requestStore.set(`__flare_form:${fnId}`, ctx)
}

export function getFormActionContext(fnId: string): FormActionContext | undefined {
	const store = getStorage().getStore()
	if (!store) return undefined
	return store.requestStore.get(`__flare_form:${fnId}`) as FormActionContext | undefined
}

export function background(promise: Promise<unknown>): void {
	const ctx = getContext()
	if (ctx.waitUntil) {
		ctx.waitUntil(promise)
	} else {
		promise.catch(() => {})
	}
}
