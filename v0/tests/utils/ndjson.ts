/**
 * NDJSON Message Builders
 *
 * Create NDJSON messages for testing navigation and data fetching.
 * Message format matches Flare's streaming protocol.
 */

/** Loader message - route data loaded */
interface LoaderMessage {
	d: unknown
	m: string
	p?: unknown
	t: "l"
}

/** Chunk message - deferred data resolved */
interface ChunkMessage {
	d: unknown
	k: string
	m: string
	t: "c"
}

/** Error message - loader or deferred error */
interface ErrorMessage {
	e: { message: string; name?: string; stack?: string }
	k?: string
	m: string
	t: "e"
}

/** Ready message - initial loaders complete, streaming chunks */
interface ReadyMessage {
	t: "r"
}

/** Done message - navigation complete */
interface DoneMessage {
	t: "d"
}

/** Head message - merged or per-route head config */
interface HeadMessage {
	d: { description?: string; title?: string }
	m?: string
	t: "h"
}

/** Query message - query state for hydration */
interface QueryMessage {
	d: Array<{ data: unknown; key: unknown[] }>
	t: "q"
}

/** All NDJSON message types */
type NdjsonMessage =
	| ChunkMessage
	| DoneMessage
	| ErrorMessage
	| HeadMessage
	| LoaderMessage
	| QueryMessage
	| ReadyMessage

/**
 * NDJSON message builder helpers
 *
 * @example
 * const messages = [
 *   ndjson.loader("_root_/products", { products: [] }),
 *   ndjson.chunk("_root_/products", "reviews", []),
 *   ndjson.done(),
 * ]
 */
const ndjson = {
	/**
	 * Create a chunk message for deferred data
	 */
	chunk(matchId: string, key: string, data: unknown): ChunkMessage {
		return { d: data, k: key, m: matchId, t: "c" }
	},

	/**
	 * Create a deferred marker (server-side representation)
	 */
	deferred(key: string): { __deferred: true; __key: string } {
		return { __deferred: true, __key: key }
	},

	/**
	 * Create a done message (navigation complete)
	 */
	done(): DoneMessage {
		return { t: "d" }
	},

	/**
	 * Create an error message for loader or deferred error
	 */
	error(
		matchId: string,
		error: Error | { message: string; name?: string; stack?: string },
		key?: string,
	): ErrorMessage {
		const msg: ErrorMessage = {
			e: {
				message: error.message,
				name: error.name,
				stack: error instanceof Error ? error.stack : error.stack,
			},
			m: matchId,
			t: "e",
		}
		if (key) {
			msg.k = key
		}
		return msg
	},

	/**
	 * Create a head message (merged or per-route)
	 */
	head(config: { description?: string; title?: string }, matchId?: string): HeadMessage {
		const msg: HeadMessage = { d: config, t: "h" }
		if (matchId) {
			msg.m = matchId
		}
		return msg
	},

	/**
	 * Create a loader message with optional preloader context
	 */
	loader(matchId: string, data: unknown, preloaderContext?: unknown): LoaderMessage {
		const msg: LoaderMessage = { d: data, m: matchId, t: "l" }
		if (preloaderContext !== undefined) {
			msg.p = preloaderContext
		}
		return msg
	},

	/**
	 * Create a query message for client hydration
	 */
	query(queries: Array<{ data: unknown; key: unknown[] }>): QueryMessage {
		return { d: queries, t: "q" }
	},

	/**
	 * Create a ready message (initial loaders complete)
	 */
	ready(): ReadyMessage {
		return { t: "r" }
	},
}

/**
 * Serialize messages to NDJSON string
 */
function toNdjsonString(messages: NdjsonMessage[]): string {
	return messages.map((m) => JSON.stringify(m)).join("\n")
}

/**
 * Parse NDJSON string to messages
 */
function parseNdjsonString(body: string): NdjsonMessage[] {
	return body
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as NdjsonMessage)
}

/**
 * Create an NDJSON Response (static, non-streaming)
 */
function createNDJSONResponse(
	messages: NdjsonMessage[],
	options?: { headers?: Record<string, string>; status?: number },
): Response {
	const body = toNdjsonString(messages)
	return new Response(body, {
		headers: {
			"Content-Type": "application/x-ndjson",
			...options?.headers,
		},
		status: options?.status ?? 200,
	})
}

/**
 * Create a streaming NDJSON Response for testing deferred behavior
 *
 * @example
 * const response = createStreamingNDJSONResponse([
 *   { messages: [ndjson.loader("_root_", { user: null }), ndjson.ready()] },
 *   { delay: 50, messages: [ndjson.chunk("_root_", "user", { name: "Alice" })] },
 *   { messages: [ndjson.done()] },
 * ])
 */
function createStreamingNDJSONResponse(
	chunks: Array<{ delay?: number; messages: NdjsonMessage[] }>,
	options?: { headers?: Record<string, string>; status?: number },
): Response {
	const encoder = new TextEncoder()

	const stream = new ReadableStream({
		async start(controller) {
			for (const chunk of chunks) {
				if (chunk.delay) {
					await new Promise((resolve) => setTimeout(resolve, chunk.delay))
				}
				const text = `${chunk.messages.map((m) => JSON.stringify(m)).join("\n")}\n`
				controller.enqueue(encoder.encode(text))
			}
			controller.close()
		},
	})

	return new Response(stream, {
		headers: {
			"Content-Type": "application/x-ndjson",
			...options?.headers,
		},
		status: options?.status ?? 200,
	})
}

export type {
	ChunkMessage,
	DoneMessage,
	ErrorMessage,
	HeadMessage,
	LoaderMessage,
	NdjsonMessage,
	QueryMessage,
	ReadyMessage,
}

export {
	createNDJSONResponse,
	createStreamingNDJSONResponse,
	ndjson,
	parseNdjsonString,
	toNdjsonString,
}
