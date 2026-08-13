/**
 * NDJSON Streaming
 *
 * Newline-delimited JSON protocol for CSR navigation.
 * Protocol:
 * - {"t":"l","m":"matchId","d":{...}} - loader data
 * - {"t":"c","m":"matchId","k":"key","d":{...}} - chunk (deferred)
 * - {"t":"e","m":"matchId","e":{message}} - error
 * - {"t":"h","d":{title,description,...}} - head config
 * - {"t":"r"} - ready
 * - {"t":"d"} - done
 *
 * Deferred values in loader data are serialized as:
 * { __deferred: true, __key: "keyName" }
 * The promise field is stripped since promises can't be JSON serialized.
 * Client reconstructs real promises and resolves them when chunks arrive.
 */

import type { HeadConfig } from "../../router/_internal/types"

type LoaderMessage = { d: unknown; m: string; p?: unknown; t: "l" }
type ChunkMessage = { d: unknown; k: string; m: string; t: "c" }
type ErrorMessage = { e: { message: string }; k?: string; m: string; t: "e" }
type HeadMessage = { d: HeadConfig; m?: string; t: "h" }
type QueryMessage = { d: QueryState[]; t: "q" }
type RedirectMessage = { r?: boolean; s: number; t: "x"; u: string }
type ReadyMessage = { t: "r" }
type DoneMessage = { t: "d" }

interface QueryState {
	data: unknown
	key: unknown[]
}

type RawMessage =
	| ChunkMessage
	| DoneMessage
	| ErrorMessage
	| HeadMessage
	| LoaderMessage
	| QueryMessage
	| RedirectMessage
	| ReadyMessage

interface ParsedLoaderMessage {
	data: unknown
	matchId: string
	preloaderContext?: unknown
	type: "loader"
}

interface ParsedChunkMessage {
	data: unknown
	key: string
	matchId: string
	type: "chunk"
}

interface ParsedErrorMessage {
	error: { message: string }
	key?: string
	matchId: string
	type: "error"
}

interface ParsedHeadMessage {
	head: HeadConfig
	matchId?: string
	type: "head"
}

interface ParsedQueryMessage {
	queries: QueryState[]
	type: "query"
}

interface ParsedRedirectMessage {
	replace: boolean
	status: number
	type: "redirect"
	url: string
}

interface ParsedReadyMessage {
	type: "ready"
}

interface ParsedDoneMessage {
	type: "done"
}

type NDJSONMessage =
	| ParsedChunkMessage
	| ParsedDoneMessage
	| ParsedErrorMessage
	| ParsedHeadMessage
	| ParsedLoaderMessage
	| ParsedQueryMessage
	| ParsedRedirectMessage
	| ParsedReadyMessage

interface LoaderResult {
	data?: unknown
	error?: Error
	matchId: string
	preloaderContext?: unknown
	status: "error" | "success"
}

/**
 * Check if value is a Deferred object
 */
function isDeferred(value: unknown): value is {
	__deferred: true
	__error?: unknown
	__key?: string
	__resolved?: unknown
	promise: unknown
} {
	return (
		value !== null &&
		typeof value === "object" &&
		"__deferred" in value &&
		(value as Record<string, unknown>).__deferred === true
	)
}

/**
 * Serialize loader data for NDJSON transport.
 * Transforms Deferred objects into serializable markers by stripping the promise field.
 * Preserves __resolved and __error for already-awaited deferred (await: true).
 * Client will use __resolved directly or reconstruct real promises from markers.
 */
function serializeLoaderData(data: unknown): unknown {
	if (data === null || data === undefined) {
		return data
	}

	if (typeof data !== "object") {
		return data
	}

	/* Transform Deferred into marker (strip promise, keep __resolved/__error) */
	if (isDeferred(data)) {
		const result: { __deferred: true; __error?: unknown; __key?: string; __resolved?: unknown } = {
			__deferred: true,
			__key: data.__key,
		}
		/* Preserve pre-resolved value for await: true deferred */
		if ("__resolved" in data) {
			result.__resolved = data.__resolved
		}
		/* Preserve error for failed deferred */
		if ("__error" in data) {
			result.__error = data.__error
		}
		return result
	}

	/* Recurse into arrays */
	if (Array.isArray(data)) {
		return data.map(serializeLoaderData)
	}

	/* Recurse into objects */
	const result: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(data)) {
		result[key] = serializeLoaderData(value)
	}
	return result
}

/**
 * Format loader data message
 */
function formatLoaderMessage(matchId: string, data: unknown, preloaderContext?: unknown): string {
	const serialized = serializeLoaderData(data)
	const msg: LoaderMessage = { d: serialized, m: matchId, t: "l" }
	if (preloaderContext !== undefined) {
		msg.p = preloaderContext
	}
	return JSON.stringify(msg)
}

/**
 * Format deferred chunk message
 */
function formatChunkMessage(matchId: string, key: string, data: unknown): string {
	const msg: ChunkMessage = { d: data, k: key, m: matchId, t: "c" }
	return JSON.stringify(msg)
}

/**
 * Format error message
 */
function formatErrorMessage(matchId: string, error: Error, key?: string): string {
	const msg: ErrorMessage = { e: { message: error.message }, k: key, m: matchId, t: "e" }
	return JSON.stringify(msg)
}

/**
 * Format head config message (merged, no route ownership)
 */
function formatHeadMessage(head: HeadConfig): string {
	const msg: HeadMessage = { d: head, t: "h" }
	return JSON.stringify(msg)
}

/**
 * Format head config message with route ownership
 */
function formatHeadMessagePerRoute(matchId: string, head: HeadConfig): string {
	const msg: HeadMessage = { d: head, m: matchId, t: "h" }
	return JSON.stringify(msg)
}

/**
 * Format query state message for client hydration
 */
function formatQueryMessage(queries: QueryState[]): string {
	const msg: QueryMessage = { d: queries, t: "q" }
	return JSON.stringify(msg)
}

/**
 * Format redirect message
 */
function formatRedirectMessage(url: string, status: number, replace?: boolean): string {
	const msg: RedirectMessage = { s: status, t: "x", u: url }
	if (replace) {
		msg.r = true
	}
	return JSON.stringify(msg)
}

/**
 * Format ready message (signals loaders are complete, chunks will stream)
 */
function formatReadyMessage(): string {
	const msg: ReadyMessage = { t: "r" }
	return JSON.stringify(msg)
}

/**
 * Format done message
 */
function formatDoneMessage(): string {
	const msg: DoneMessage = { t: "d" }
	return JSON.stringify(msg)
}

/**
 * Parse a single NDJSON line
 */
function parseNDJSONLine(line: string): NDJSONMessage | null {
	try {
		const raw = JSON.parse(line) as RawMessage

		switch (raw.t) {
			case "l":
				return {
					data: raw.d,
					matchId: raw.m,
					preloaderContext: raw.p,
					type: "loader",
				}
			case "c":
				return {
					data: raw.d,
					key: raw.k,
					matchId: raw.m,
					type: "chunk",
				}
			case "e":
				return {
					error: raw.e,
					key: raw.k,
					matchId: raw.m,
					type: "error",
				}
			case "h":
				return {
					head: raw.d,
					matchId: raw.m,
					type: "head",
				}
			case "q":
				return {
					queries: raw.d,
					type: "query",
				}
			case "x":
				return {
					replace: raw.r ?? false,
					status: raw.s,
					type: "redirect",
					url: raw.u,
				}
			case "r":
				return { type: "ready" }
			case "d":
				return { type: "done" }
			default:
				return null
		}
	} catch {
		return null
	}
}

/**
 * Create NDJSON response from loader results (non-streaming)
 */
function createNDJSONResponse(
	results: LoaderResult[],
	head?: HeadConfig,
	queries?: QueryState[],
	perRouteHeads?: RouteHead[],
): Response {
	const lines: string[] = []

	for (const result of results) {
		if (result.status === "error" && result.error) {
			lines.push(formatErrorMessage(result.matchId, result.error))
		} else {
			lines.push(formatLoaderMessage(result.matchId, result.data, result.preloaderContext))
		}
	}

	/* Include per-route head configs (preferred) or merged head (fallback) */
	if (perRouteHeads && perRouteHeads.length > 0) {
		for (const { matchId, head: routeHead } of perRouteHeads) {
			if (Object.keys(routeHead).length > 0) {
				lines.push(formatHeadMessagePerRoute(matchId, routeHead))
			}
		}
	} else if (head && Object.keys(head).length > 0) {
		lines.push(formatHeadMessage(head))
	}

	/* Include query state for client hydration */
	if (queries && queries.length > 0) {
		lines.push(formatQueryMessage(queries))
	}

	lines.push(formatDoneMessage())

	const body = `${lines.join("\n")}\n`

	return new Response(body, {
		headers: {
			"Cache-Control": "no-store",
			"Content-Type": "application/x-ndjson",
		},
	})
}

interface DeferredPromise {
	key: string
	matchId: string | null
	promise: Promise<unknown>
	stream: boolean
}

interface DeferContext {
	getDeferred: () => DeferredPromise[]
}

interface RouteHead {
	head: HeadConfig
	matchId: string
}

/**
 * Create streaming NDJSON response with deferred chunks.
 *
 * 1. Sends loader data immediately
 * 2. Sends per-route head configs (with matchId for route ownership)
 * 3. Sends query state for client hydration
 * 4. Streams chunk messages as deferred promises resolve
 * 5. Sends done message when all complete
 */
function createStreamingNDJSONResponse(
	results: LoaderResult[],
	deferContexts: Map<string, DeferContext>,
	head?: HeadConfig,
	queries?: QueryState[],
	perRouteHeads?: RouteHead[],
): Response {
	/* Collect all deferred promises that should stream */
	const streamingDeferred: Array<{
		key: string
		matchId: string
		promise: Promise<unknown>
	}> = []

	for (const [matchId, ctx] of deferContexts) {
		for (const d of ctx.getDeferred()) {
			if (d.stream) {
				streamingDeferred.push({
					key: d.key,
					matchId: d.matchId ?? matchId,
					promise: d.promise,
				})
			}
		}
	}

	/* If no streaming deferred, return static response */
	if (streamingDeferred.length === 0) {
		return createNDJSONResponse(results, head, queries, perRouteHeads)
	}

	/* Create streaming response */
	const encoder = new TextEncoder()

	const stream = new ReadableStream({
		async start(controller) {
			/* Send loader messages immediately */
			for (const result of results) {
				const line =
					result.status === "error" && result.error
						? formatErrorMessage(result.matchId, result.error)
						: formatLoaderMessage(result.matchId, result.data, result.preloaderContext)
				controller.enqueue(encoder.encode(`${line}\n`))
			}

			/* Send per-route head configs (preferred) or merged head (fallback) */
			if (perRouteHeads && perRouteHeads.length > 0) {
				for (const { matchId, head: routeHead } of perRouteHeads) {
					if (Object.keys(routeHead).length > 0) {
						controller.enqueue(encoder.encode(`${formatHeadMessagePerRoute(matchId, routeHead)}\n`))
					}
				}
			} else if (head && Object.keys(head).length > 0) {
				controller.enqueue(encoder.encode(`${formatHeadMessage(head)}\n`))
			}

			/* Send query state for client hydration */
			if (queries && queries.length > 0) {
				controller.enqueue(encoder.encode(`${formatQueryMessage(queries)}\n`))
			}

			/* Signal loaders complete - client can render immediately */
			controller.enqueue(encoder.encode(`${formatReadyMessage()}\n`))

			/* Stream deferred chunks as they resolve */
			const chunkPromises = streamingDeferred.map(async ({ key, matchId, promise }) => {
				try {
					const data = await promise
					const line = formatChunkMessage(matchId, key, data)
					controller.enqueue(encoder.encode(`${line}\n`))
				} catch (error) {
					const err = error instanceof Error ? error : new Error(String(error))
					const line = formatErrorMessage(matchId, err, key)
					controller.enqueue(encoder.encode(`${line}\n`))
				}
			})

			/* Wait for all deferred to complete */
			await Promise.allSettled(chunkPromises)

			/* Send done message */
			controller.enqueue(encoder.encode(`${formatDoneMessage()}\n`))
			controller.close()
		},
	})

	return new Response(stream, {
		headers: {
			"Cache-Control": "no-store",
			"Content-Type": "application/x-ndjson",
			"Transfer-Encoding": "chunked",
		},
	})
}

export type { DeferContext, LoaderResult, NDJSONMessage, RouteHead }

export {
	createNDJSONResponse,
	createStreamingNDJSONResponse,
	formatChunkMessage,
	formatDoneMessage,
	formatErrorMessage,
	formatHeadMessage,
	formatHeadMessagePerRoute,
	formatLoaderMessage,
	formatQueryMessage,
	formatRedirectMessage,
	formatReadyMessage,
	parseNDJSONLine,
}
