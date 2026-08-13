import type { HeadConfig } from "../route-builder/types.ts"
import type { FlareMatchState, FlareState } from "../ssr/index.tsx"
import type { SearchParams } from "../url/index.ts"

export type { FlareState, FlareMatchState }

export interface DeferredMarker {
	__deferred: true
	key: string
}

export interface HydratedMatch {
	errorName?: string
	headConfig?: HeadConfig
	loaderData: unknown
	matchId: string
	preloaderContext?: Record<string, unknown>
	virtualPath: string
}

export interface ParseResult {
	matches: HydratedMatch[]
	params: Record<string, string | string[]>
	pathname: string
	resolvers: Map<string, DeferredResolver>
	search: SearchParams
}

export interface DeferredResolver {
	reject: (error: Error) => void
	resolve: (data: unknown) => void
}

export function parseFlareState(raw: unknown): FlareState | null {
	if (raw === null || raw === undefined || typeof raw !== "object") return null

	const obj = raw as Record<string, unknown>
	if (
		typeof obj.c !== "object" ||
		obj.c === null ||
		!Array.isArray(obj.m) ||
		typeof obj.p !== "string" ||
		typeof obj.r !== "object" ||
		obj.r === null ||
		typeof obj.s !== "object" ||
		obj.s === null
	) {
		return null
	}

	return raw as FlareState
}

export function isDeferredMarker(value: unknown): value is DeferredMarker {
	if (value === null || value === undefined || typeof value !== "object") return false
	const obj = value as Record<string, unknown>
	return obj.__deferred === true && "key" in obj && typeof obj.key === "string"
}

export function hydrateLoaderData(
	matchId: string,
	data: unknown,
	resolvers: Map<string, DeferredResolver>,
): unknown {
	if (data === null || data === undefined) return data
	if (typeof data !== "object") return data

	if (isDeferredMarker(data)) {
		let resolveFn: (d: unknown) => void = () => {}
		let rejectFn: (e: Error) => void = () => {}
		const promise = new Promise<unknown>((resolve, reject) => {
			resolveFn = resolve
			rejectFn = reject
		})
		resolvers.set(`${matchId}:${data.key}`, { reject: rejectFn, resolve: resolveFn })
		return { __deferred: true, __key: data.key, promise }
	}

	if (Array.isArray(data)) {
		return data.map((item) => hydrateLoaderData(matchId, item, resolvers))
	}

	const obj = data as Record<string, unknown>
	const result: Record<string, unknown> = Object.create(null)
	for (const key of Object.keys(obj)) {
		if (key === "__proto__" || key === "constructor" || key === "prototype") continue
		result[key] = hydrateLoaderData(matchId, obj[key], resolvers)
	}
	return result
}

/**
 * Register `self.__flare_r(resolverKey, data)` global so streamed `<script>` tags
 * from SSR deferred resolution can resolve hydrated promise shells.
 */
declare global {
	var __flare_q:
		| Array<[string, unknown, boolean?]>
		| { push: (entry: [string, unknown, boolean?]) => number }
		| undefined
	var __flare_qc: Array<[unknown]> | { push: (entry: [unknown]) => number } | undefined
	var __flare_r: ((key: string, data: unknown) => void) | undefined
	var __flare_re: ((key: string, message: string) => void) | undefined
}

/*
 * Multi-instance registry: supports multiple Flare apps hydrating on the same page.
 * Each call to installDeferredResolver registers its resolver map. The global
 * __flare_r/__flare_re/__flare_q search ALL active maps when resolving a key.
 * Globals are only cleaned when every active map is drained AND no pending entries remain.
 */
const activeInstances = new Set<Map<string, DeferredResolver>>()
const pendingEntries: Array<[string, unknown, boolean?]> = []

function resolveOrBuffer(key: string, data: unknown, isError: boolean): void {
	for (const m of activeInstances) {
		const resolver = m.get(key)
		if (resolver) {
			if (isError) {
				resolver.reject(new Error(data as string))
			} else {
				resolver.resolve(data)
			}
			m.delete(key)
			return
		}
	}
	pendingEntries.push(isError ? [key, data, true] : [key, data])
}

function cleanupIfAllEmpty(): void {
	if (pendingEntries.length > 0) return
	for (const m of activeInstances) {
		if (m.size > 0) return
	}
	globalThis.__flare_r = undefined
	globalThis.__flare_re = undefined
	globalThis.__flare_q = undefined
	activeInstances.clear()
}

/**
 * Drain buffered deferred chunks from SSR streamed `<script>` tags,
 * then install live resolver for any late-arriving chunks.
 *
 * SSR scripts push `[key, data]` (or `[key, msg, true]` for errors)
 * into `self.__flare_q` array. This function drains them, then replaces
 * the array push with a direct resolver so future chunks resolve immediately.
 *
 * Safe for multiple Flare instances on the same page — resolvers compose
 * rather than overwrite, and globals are only cleaned when all are drained.
 */
export function installDeferredResolver(resolvers: Map<string, DeferredResolver>): void {
	if (typeof globalThis === "undefined") return

	/* Reset registry if globals were cleaned externally (e.g. tests) */
	if (!globalThis.__flare_r && activeInstances.size > 0) {
		activeInstances.clear()
		pendingEntries.length = 0
	}

	activeInstances.add(resolvers)

	/* Drain any buffered entries from SSR script tags */
	const queue = globalThis.__flare_q
	if (Array.isArray(queue)) {
		for (const entry of queue) {
			resolveOrBuffer(entry[0], entry[1], Boolean(entry[2]))
		}
	}

	/* Drain pending entries — new instance may have matching resolvers */
	if (pendingEntries.length > 0) {
		const pending = [...pendingEntries]
		pendingEntries.length = 0
		for (const entry of pending) {
			resolveOrBuffer(entry[0], entry[1], Boolean(entry[2]))
		}
	}

	/* Install live resolvers for chunks that stream after hydration */
	globalThis.__flare_r = (key: string, data: unknown) => {
		resolveOrBuffer(key, data, false)
		cleanupIfAllEmpty()
	}
	globalThis.__flare_re = (key: string, message: string) => {
		resolveOrBuffer(key, message, true)
		cleanupIfAllEmpty()
	}

	/*
	 * Trap __flare_q so late-arriving SSR script pushes resolve immediately.
	 * SSR scripts do `(self.__flare_q=self.__flare_q||[]).push([...])` — after
	 * drain, new pushes must route through the live resolver, not the array.
	 */
	globalThis.__flare_q = {
		push(entry: [string, unknown, boolean?]) {
			resolveOrBuffer(entry[0], entry[1], Boolean(entry[2]))
			cleanupIfAllEmpty()
			return 0
		},
	}

	/* If no resolvers needed (all data was instant), clean up immediately */
	cleanupIfAllEmpty()
}

/**
 * Drain buffered deferred QC entries from SSR streamed `<script>` tags,
 * then install live proxy for late-arriving entries.
 *
 * SSR scripts push `[{data, key, staleTime?}]` into `self.__flare_qc` array.
 * This function drains them, then replaces the array with a push-proxy
 * so future scripts hydrate immediately.
 */
export function installQueryCacheResolver(queryClient: unknown): void {
	if (typeof globalThis === "undefined") return

	const qc = queryClient as {
		setQueryData: (key: unknown[], data: unknown) => void
		setQueryDefaults: (key: unknown[], defaults: { staleTime: number }) => void
	}

	function applyEntry(entry: unknown): void {
		if (typeof entry !== "object" || entry === null) return
		const e = entry as { data: unknown; key: unknown[]; staleTime?: number }
		if (!Array.isArray(e.key)) return
		qc.setQueryData(e.key, e.data)
		if (typeof e.staleTime === "number" && Number.isFinite(e.staleTime) && e.staleTime >= 0) {
			qc.setQueryDefaults(e.key, { staleTime: e.staleTime })
		}
	}

	/* Drain any buffered entries from SSR script tags */
	const queue = globalThis.__flare_qc
	if (Array.isArray(queue)) {
		for (const entry of queue) {
			applyEntry(entry[0])
		}
	}

	/* Install push-proxy for late-arriving SSR scripts */
	globalThis.__flare_qc = {
		push(entry: [unknown]) {
			applyEntry(entry[0])
			return 0
		},
	}
}

export function hydrateFlareState(state: FlareState): ParseResult {
	const resolvers = new Map<string, DeferredResolver>()

	const matches: HydratedMatch[] = state.m.map((match) => ({
		errorName: match.x,
		headConfig: match.h,
		loaderData: hydrateLoaderData(match.i, match.d, resolvers),
		matchId: match.i,
		preloaderContext: match.p,
		virtualPath: match.v,
	}))

	return {
		matches,
		params: state.r,
		pathname: state.p,
		resolvers,
		search: state.s,
	}
}
