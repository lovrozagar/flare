/**
 * NDJSON Navigation Client
 *
 * Handles NDJSON nav mode on client side.
 * Fetches loader data as NDJSON stream, updates caches.
 * Layouts persist - only changed data is fetched.
 *
 * Deferred data handling:
 * Server sends deferred markers: { __deferred: true, __key: "keyName" }
 * Client creates real Promises for these markers.
 * When chunk messages arrive, client resolves corresponding promises.
 */

import type { HeadConfig } from "../router/_internal/types"
import { CSR_HEADER_VALUES, CSR_HEADERS, NAV_FORMAT } from "../server/handler/constants"
import type {
	MatchState,
	NavFetcher,
	NavFetcherConfig,
	NavFetchOptions,
	NavFetchResult,
	NavState,
	QueryState,
} from "./nav-types"

interface LoaderMessage {
	d: unknown
	m: string
	p?: unknown
	t: "l"
}

interface ChunkMessage {
	d: unknown
	k: string
	m: string
	t: "c"
}

interface ErrorMessage {
	e: { message: string }
	k?: string
	m: string
	t: "e"
}

interface HeadMessage {
	d: HeadConfig
	m?: string
	t: "h"
}

interface QueryMessage {
	d: Array<{ data: unknown; key: unknown[] }>
	t: "q"
}

interface ReadyMessage {
	t: "r"
}

interface DoneMessage {
	t: "d"
}

type NdjsonMessage =
	| ChunkMessage
	| DoneMessage
	| ErrorMessage
	| HeadMessage
	| LoaderMessage
	| QueryMessage
	| ReadyMessage

interface DeferredMarker {
	__deferred: true
	__key: string
}

type DeferredResolver = (data: unknown) => void
type DeferredRejecter = (error: Error) => void

function parseNdjsonLine(line: string): NdjsonMessage | null {
	const trimmed = line.trim()
	if (!trimmed) {
		return null
	}

	try {
		return JSON.parse(trimmed) as NdjsonMessage
	} catch {
		return null
	}
}

/**
 * Check if value is a deferred marker from server
 */
function isDeferredMarker(value: unknown): value is DeferredMarker {
	return (
		value !== null &&
		typeof value === "object" &&
		"__deferred" in value &&
		(value as Record<string, unknown>).__deferred === true &&
		"__key" in value &&
		typeof (value as Record<string, unknown>).__key === "string"
	)
}

/**
 * Hydrate loader data by replacing deferred markers with real promises.
 * Returns the hydrated data and a map of resolvers for each deferred.
 */
function hydrateLoaderData(
	matchId: string,
	data: unknown,
	resolvers: Map<string, { reject: DeferredRejecter; resolve: DeferredResolver }>,
): unknown {
	if (data === null || data === undefined) {
		return data
	}

	if (typeof data !== "object") {
		return data
	}

	/* Transform deferred marker into real Deferred with promise */
	if (isDeferredMarker(data)) {
		let resolveRef: DeferredResolver | undefined
		let rejectRef: DeferredRejecter | undefined
		const promise = new Promise<unknown>((res, rej) => {
			resolveRef = res
			rejectRef = rej
		})

		/* Store resolver keyed by matchId:key */
		const resolverKey = `${matchId}:${data.__key}`
		if (resolveRef && rejectRef) {
			resolvers.set(resolverKey, { reject: rejectRef, resolve: resolveRef })
		}

		/* Return Deferred object with real promise */
		return {
			__deferred: true,
			__key: data.__key,
			promise,
		}
	}

	/* Recurse into arrays */
	if (Array.isArray(data)) {
		return data.map((item) => hydrateLoaderData(matchId, item, resolvers))
	}

	/* Recurse into objects */
	const result: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(data)) {
		result[key] = hydrateLoaderData(matchId, value, resolvers)
	}
	return result
}

/**
 * Create NDJSON navigation fetcher
 *
 * Streams response for true progressive loading:
 * 1. Returns immediately after loader messages (with deferred promises pending)
 * 2. Continues reading chunks in background, resolving promises as they arrive
 * 3. Cancels pending promises if navigation is aborted
 */
function createNdjsonNavFetcher(config: NavFetcherConfig): NavFetcher {
	const { baseUrl, fetch: fetchFn = globalThis.fetch } = config

	async function fetchNdjson(options: NavFetchOptions): Promise<NavFetchResult> {
		const { prefetch, signal, url } = options

		const headers: Record<string, string> = {
			[CSR_HEADERS.DATA_REQUEST]: CSR_HEADER_VALUES.DATA_REQUEST_ENABLED,
			[CSR_HEADERS.NAV_FORMAT]: NAV_FORMAT.NDJSON,
		}

		if (prefetch) {
			headers[CSR_HEADERS.PREFETCH] = "1"
		}

		try {
			const response = await fetchFn(`${baseUrl}${url}`, {
				headers,
				method: "GET",
				signal,
			})

			if (!response.ok) {
				return {
					error: new Error(`NDJSON nav failed: ${response.status}`),
					success: false,
				}
			}

			if (!response.body) {
				return {
					error: new Error("NDJSON response has no body"),
					success: false,
				}
			}

			const matches: MatchState[] = []
			const queries: QueryState[] = []
			let headConfig: HeadConfig | undefined
			const perRouteHeads: Array<{ head: HeadConfig; matchId: string }> = []

			/* Track deferred resolvers - will be resolved as chunks stream in */
			const deferredResolvers = new Map<
				string,
				{ reject: DeferredRejecter; resolve: DeferredResolver }
			>()

			/* Promise that resolves when loaders are ready (before chunks) */
			let resolveLoadersReady: () => void = () => {}
			const loadersReady = new Promise<void>((resolve) => {
				resolveLoadersReady = resolve
			})

			/* Start streaming in background */
			void (async () => {
				const body = response.body
				if (!body) return
				const reader = body.getReader()
				const decoder = new TextDecoder()
				let buffer = ""
				let loadersEmitted = false

				try {
					while (true) {
						if (signal?.aborted) {
							reader.cancel()
							for (const resolver of deferredResolvers.values()) {
								resolver.reject(new Error("Navigation cancelled"))
							}
							return
						}

						const { done, value } = await reader.read()
						if (done) break

						buffer += decoder.decode(value, { stream: true })
						const lines = buffer.split("\n")
						buffer = lines.pop() ?? ""

						for (const line of lines) {
							if (!line.trim()) continue
							if (signal?.aborted) {
								for (const resolver of deferredResolvers.values()) {
									resolver.reject(new Error("Navigation cancelled"))
								}
								return
							}

							const msg = parseNdjsonLine(line)
							if (!msg) continue

							switch (msg.t) {
								case "l": {
									const hydratedData = hydrateLoaderData(msg.m, msg.d, deferredResolvers)
									matches.push({
										id: msg.m,
										loaderData: hydratedData,
										preloaderContext: msg.p,
									})
									break
								}
								case "r": {
									/* Ready message - loaders complete, signal to render */
									if (!loadersEmitted) {
										loadersEmitted = true
										resolveLoadersReady()
									}
									break
								}
								case "c": {
									/* Chunk with deferred data */
									const resolverKey = `${msg.m}:${msg.k}`
									const resolver = deferredResolvers.get(resolverKey)
									if (resolver) {
										resolver.resolve(msg.d)
										deferredResolvers.delete(resolverKey)
									}
									break
								}
								case "e": {
									/* Error for specific deferred key */
									const errorKey = msg.k ? `${msg.m}:${msg.k}` : `${msg.m}:error`
									const resolver = deferredResolvers.get(errorKey)
									if (resolver) {
										resolver.reject(new Error(msg.e.message))
										deferredResolvers.delete(errorKey)
									}
									break
								}
								case "h": {
									/* Head config - per-route (with matchId) or merged (without) */
									if (msg.m) {
										perRouteHeads.push({ head: msg.d, matchId: msg.m })
									} else {
										headConfig = msg.d
									}
									break
								}
								case "q": {
									/* Query state for client hydration */
									for (const q of msg.d) {
										queries.push({ data: q.data, key: q.key })
									}
									break
								}
								case "d": {
									/* Done - signal ready if not already (fallback) */
									if (!loadersEmitted) {
										loadersEmitted = true
										resolveLoadersReady()
									}
									break
								}
							}
						}
					}

					/* Process remaining buffer */
					if (buffer.trim()) {
						const msg = parseNdjsonLine(buffer)
						if ((msg?.t === "r" || msg?.t === "d") && !loadersEmitted) {
							resolveLoadersReady()
						}
					}
				} catch {
					for (const resolver of deferredResolvers.values()) {
						resolver.reject(new Error("Stream error"))
					}
				}
			})()

			/* Wait for loaders to be ready (first chunk or done signals this) */
			await loadersReady

			const state: NavState = {
				matches,
				params: {},
				pathname: url,
				queries,
			}

			return {
				head: headConfig,
				/* Always include perRouteHeads array for cleanup support -
				 * even an empty array triggers cleanup of stale elements */
				perRouteHeads,
				state,
				success: true,
			}
		} catch (e) {
			if (e instanceof Error && e.name === "AbortError") {
				return { success: false }
			}
			return {
				error: e instanceof Error ? e : new Error(String(e)),
				success: false,
			}
		}
	}

	return {
		fetch: fetchNdjson,
	}
}

export type {
	ChunkMessage,
	DoneMessage,
	ErrorMessage,
	HeadMessage,
	LoaderMessage,
	NdjsonMessage,
	ReadyMessage,
}

export { createNdjsonNavFetcher, parseNdjsonLine }
