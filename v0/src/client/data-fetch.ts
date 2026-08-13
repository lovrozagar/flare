/**
 * Client Data Fetcher
 *
 * NDJSON data fetching for CSR navigation.
 * Sends x-d, x-s, x-m headers and parses streaming response.
 */

import { CSR_HEADER_VALUES, CSR_HEADERS } from "../server/handler/constants"

interface LoaderMessage {
	d: unknown
	m: string
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
	m: string
	t: "e"
}

interface DoneMessage {
	t: "d"
}

type NdjsonMessage = ChunkMessage | DoneMessage | ErrorMessage | LoaderMessage

interface DataFetchConfig {
	baseUrl: string
	fetch?: typeof globalThis.fetch
}

interface DataFetchOptions {
	matchIds: string[]
	onChunk?: (matchId: string, key: string, data: unknown) => void
	onDone?: () => void
	onError?: (matchId: string, error: { message: string }) => void
	onLoader?: (matchId: string, data: unknown) => void
	prefetch?: boolean
	signal?: AbortSignal
	url: string
}

interface DataFetcher {
	fetch: (options: DataFetchOptions) => Promise<void>
}

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

function createDataFetcher(config: DataFetchConfig): DataFetcher {
	const { baseUrl, fetch: fetchFn = globalThis.fetch } = config

	async function fetchData(options: DataFetchOptions): Promise<void> {
		const { matchIds, onChunk, onDone, onError, onLoader, prefetch, signal, url } = options

		const headers: Record<string, string> = {
			[CSR_HEADERS.DATA_REQUEST]: CSR_HEADER_VALUES.DATA_REQUEST_ENABLED,
		}

		if (matchIds.length > 0) {
			headers[CSR_HEADERS.MATCH_IDS] = matchIds.join(",")
		}

		if (prefetch) {
			headers[CSR_HEADERS.PREFETCH] = "1"
		}

		const response = await fetchFn(`${baseUrl}${url}`, {
			headers,
			method: "GET",
			signal,
		})

		const text = await response.text()
		const lines = text.split("\n")

		for (const line of lines) {
			/* Skip processing if navigation was aborted */
			if (signal?.aborted) {
				return
			}

			const msg = parseNdjsonLine(line)
			if (!msg) {
				continue
			}

			switch (msg.t) {
				case "l":
					onLoader?.(msg.m, msg.d)
					break
				case "c":
					onChunk?.(msg.m, msg.k, msg.d)
					break
				case "e":
					onError?.(msg.m, msg.e)
					break
				case "d":
					onDone?.()
					break
			}
		}
	}

	return {
		fetch: fetchData,
	}
}

export type {
	ChunkMessage,
	DataFetchConfig,
	DataFetchOptions,
	DataFetcher,
	DoneMessage,
	ErrorMessage,
	LoaderMessage,
	NdjsonMessage,
}

export { createDataFetcher, parseNdjsonLine }
