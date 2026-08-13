import { NotFoundError, RedirectResponse, UnauthenticatedError, UnauthorizedError } from "../errors/index.ts"
import { warn } from "../logger.ts"
import type { HeadConfig } from "../route-builder/types.ts"
import type { DeferredResolver } from "../state-parser/index.ts"
import { hydrateLoaderData } from "../state-parser/index.ts"

const MAX_LINE_BYTES = 5 * 1024 * 1024
const MAX_MESSAGES = 10_000

export interface NDJSONFetchOptions {
	matchIds?: string[]
	prefetch?: boolean
	queryClient?: unknown
	signal?: AbortSignal
	url: string
}

export interface NDJSONFetchResult {
	matches: FetchedMatch[]
	perRouteHeads: PerRouteHead[]
	success: boolean
}

export interface FetchedMatch {
	error?: Error
	hasDeferredMarkers?: boolean
	loaderData: unknown
	matchId: string
	preloaderContext?: Record<string, unknown>
}

export interface PerRouteHead {
	head: HeadConfig
	matchId: string
}

interface NDJSONMessage {
	a?: unknown[]
	d?: unknown
	e?: { message: string; name?: string }
	k?: string
	l?: string
	m?: string
	p?: Record<string, unknown>
	/* Redirect fields (t:"x") */
	r?: boolean
	s?: number
	t: string
	u?: string
	xl?: boolean
}

/*
 * Reconstruct the correct error class from NDJSON error name.
 * Server sends `{ message, name }` — client needs `instanceof` checks
 * for NotFoundError, UnauthenticatedError, UnauthorizedError.
 */
function reconstructError(e?: { message: string; name?: string }): Error {
	const message = e?.message ?? "Unknown error"
	switch (e?.name) {
		case "NotFoundError":
			return new NotFoundError(message)
		case "UnauthenticatedError":
			return new UnauthenticatedError(message)
		case "UnauthorizedError":
			return new UnauthorizedError(message)
		default: {
			const err = new Error(message)
			if (e?.name) err.name = e.name
			return err
		}
	}
}

const SERVER_LOG_PREFIX = "%c[server]"
const SERVER_LOG_STYLE = "color:#60a5fa;font-weight:bold"
const SOURCE_STYLE = "color:#9ca3af"

function forwardServerLog(msg: NDJSONMessage): void {
	const args = Array.isArray(msg.a) ? msg.a : []
	const prefix = msg.s
		? [SERVER_LOG_PREFIX, SERVER_LOG_STYLE, `%c ${msg.s}`, SOURCE_STYLE, ...args]
		: [SERVER_LOG_PREFIX, SERVER_LOG_STYLE, ...args]
	switch (msg.l) {
		case "warn":
			console.warn(...prefix)
			break
		case "error":
			console.error(...prefix)
			break
		default:
			console.log(...prefix)
			break
	}
}

export async function fetchNDJSON(options: NDJSONFetchOptions): Promise<NDJSONFetchResult> {
	const headers: Record<string, string> = { "x-d": "1" }

	if (options.matchIds) {
		headers["x-m"] = options.matchIds.join(",")
	}

	if (options.prefetch) {
		headers["x-p"] = "1"
	}

	const response = await fetch(options.url, {
		headers,
		signal: options.signal,
	})

	if (!response.ok) {
		return { matches: [], perRouteHeads: [], success: false }
	}

	const matches: FetchedMatch[] = []
	const perRouteHeads: PerRouteHead[] = []
	const deferredResolvers = new Map<string, DeferredResolver>()

	let loadersReadyResolve: () => void = () => {}
	let loadersReadyResolved = false
	const loadersReady = new Promise<void>((resolve) => {
		loadersReadyResolve = resolve
	})

	function resolveLoadersReady() {
		if (!loadersReadyResolved) {
			loadersReadyResolved = true
			loadersReadyResolve()
		}
	}

	if (!response.body) {
		return { matches: [], perRouteHeads: [], success: false }
	}

	const reader = response.body.getReader()
	const decoder = new TextDecoder()
	let buffer = ""

	function processLine(raw: string) {
		const trimmed = raw.trim()
		if (!trimmed) return

		let msg: NDJSONMessage
		try {
			const parsed: unknown = JSON.parse(trimmed)
			if (
				typeof parsed !== "object" ||
				parsed === null ||
				typeof (parsed as NDJSONMessage).t !== "string"
			) {
				warn("ndjson", "invalid message, skipping", trimmed)
				return
			}
			msg = parsed as NDJSONMessage
		} catch (e: unknown) {
			warn("ndjson", "invalid message, skipping", e)
			return
		}

		switch (msg.t) {
			case "g": {
				forwardServerLog(msg)
				break
			}

			case "l": {
				if (options.prefetch) {
					matches.push({
						hasDeferredMarkers: containsDeferredMarkers(msg.d) || undefined,
						loaderData: msg.d,
						matchId: msg.m ?? "",
						preloaderContext: msg.p,
					})
				} else {
					const sizeBefore = deferredResolvers.size
					const hydrated = hydrateLoaderData(msg.m ?? "", msg.d, deferredResolvers)
					matches.push({
						hasDeferredMarkers: deferredResolvers.size > sizeBefore || undefined,
						loaderData: hydrated,
						matchId: msg.m ?? "",
						preloaderContext: msg.p,
					})
				}
				break
			}

			case "c": {
				const resolverKey = `${msg.m}:${msg.k}`
				const resolver = deferredResolvers.get(resolverKey)
				if (resolver) {
					resolver.resolve(msg.d)
					deferredResolvers.delete(resolverKey)
				}
				break
			}

			case "e": {
				const err = reconstructError(msg.e)
				if (msg.k) {
					const resolverKey = `${msg.m}:${msg.k}`
					const resolver = deferredResolvers.get(resolverKey)
					if (resolver) {
						resolver.reject(err)
						deferredResolvers.delete(resolverKey)
					}
				} else {
					matches.push({
						error: err,
						loaderData: undefined,
						matchId: msg.m ?? "",
					})
				}
				break
			}

			case "h": {
				if (typeof msg.d === "object" && msg.d !== null) {
					perRouteHeads.push({
						head: msg.d as HeadConfig,
						matchId: msg.m ?? "",
					})
				}
				break
			}

			case "x": {
				reader.cancel()
				rejectPendingResolvers()
				if (msg.xl) {
					throw new RedirectResponse({
						href: msg.u ?? "/",
						replace: msg.r,
						status: msg.s,
					})
				}
				throw new RedirectResponse({
					replace: msg.r,
					status: msg.s,
					to: msg.u ?? "/",
				})
			}

			case "q": {
				if (options.queryClient && Array.isArray(msg.d)) {
					import("../query-client")
						.then(({ hydrateQueryCache }) => {
							hydrateQueryCache(
								options.queryClient as Parameters<typeof hydrateQueryCache>[0],
								msg.d as Parameters<typeof hydrateQueryCache>[1],
							)
						})
						.catch(() => {})
				}
				break
			}

			case "r": {
				resolveLoadersReady()
				break
			}

			case "d": {
				resolveLoadersReady()
				break
			}

			default:
				break
		}
	}

	function rejectPendingResolvers() {
		for (const [key, resolver] of deferredResolvers) {
			resolver.reject(new Error("Navigation cancelled"))
			deferredResolvers.delete(key)
		}
	}

	const readPromise = (async () => {
		let messageCount = 0
		try {
			while (true) {
				if (options.signal?.aborted) {
					reader.cancel()
					rejectPendingResolvers()
					break
				}

				const { done, value } = await reader.read()
				if (done) {
					/* Flush any buffered partial UTF-8 bytes from the decoder */
					buffer += decoder.decode()
					if (buffer.trim()) {
						processLine(buffer)
					}
					resolveLoadersReady()
					rejectPendingResolvers()
					break
				}

				buffer += decoder.decode(value, { stream: true })
				if (buffer.length > MAX_LINE_BYTES) {
					warn("ndjson", "line buffer exceeded maximum size, aborting stream")
					reader.cancel()
					rejectPendingResolvers()
					resolveLoadersReady()
					break
				}
				const lines = buffer.split("\n")
				buffer = lines.pop() ?? ""

				for (const ln of lines) {
					messageCount++
					if (messageCount > MAX_MESSAGES) {
						warn("ndjson", "max message count exceeded, aborting stream")
						reader.cancel()
						rejectPendingResolvers()
						resolveLoadersReady()
						return
					}
					processLine(ln)
				}
			}
		} catch (e) {
			rejectPendingResolvers()
			/* Redirects always propagate — caller must handle redirect even mid-stream */
			if (e instanceof RedirectResponse) {
				throw e
			}
			if (loadersReadyResolved) {
				warn("ndjson", "post-loaders stream error", e)
				return
			}
			/* Error before loaders ready — propagate so caller sees the failure */
			throw e
		} finally {
			if (typeof reader.releaseLock === "function") reader.releaseLock()
		}
	})()

	/*
	 * Track redirects that arrive after loadersReady resolves.
	 * Non-redirect errors are swallowed — they happen after loaders
	 * are already delivered, so the caller doesn't need them.
	 */
	let pendingRedirect: RedirectResponse | undefined
	readPromise.catch((e) => {
		if (e instanceof RedirectResponse) pendingRedirect = e
	})

	/* Wait for loadersReady, but if readPromise rejects first, propagate */
	await Promise.race([loadersReady, readPromise])

	/*
	 * Flush microtask queue so the readPromise catch handler has a chance
	 * to set pendingRedirect if the redirect arrived in the same chunk.
	 */
	await new Promise<void>((r) => queueMicrotask(r))
	if (pendingRedirect) throw pendingRedirect

	return { matches, perRouteHeads, success: true }
}

const MAX_DEFERRED_DEPTH = 50

function containsDeferredMarkers(data: unknown, depth = 0): boolean {
	if (depth > MAX_DEFERRED_DEPTH) return false
	if (data === null || data === undefined || typeof data !== "object") return false
	if ((data as Record<string, unknown>).__deferred === true) return true
	if (Array.isArray(data)) return data.some((v) => containsDeferredMarkers(v, depth + 1))
	return Object.values(data as Record<string, unknown>).some((v) =>
		containsDeferredMarkers(v, depth + 1),
	)
}
