import type { DeferContext, DeferredEntry } from "../defer/index.ts";
import { isDeferred } from "../defer/index.ts";
import type { RedirectResponse } from "../errors/index.ts";
import type { PipelineMatch } from "../loader-pipeline/index.ts";
import type { HeadConfig } from "../route-builder/types.ts";
import type { ServerLogEntry } from "@lovrozagar/flare/server-context";

export interface NDJSONResponseConfig {
	abortController?: AbortController;
	deferContexts: Map<string, DeferContext>;
	matches: PipelineMatch[];
	queryClient?: unknown;
	serverLogs?: ServerLogEntry[];
	status?: number;
}

export function followAbortSignal(controller: AbortController, signal: AbortSignal | undefined): void {
	if (!signal) return;
	if (signal.aborted) {
		controller.abort();
		return;
	}
	signal.addEventListener(
		"abort",
		() => {
			if (!controller.signal.aborted) controller.abort();
		},
		{ once: true },
	);
}

const NDJSON_HEADERS = {
	"Cache-Control": "no-store",
	"Content-Type": "application/x-ndjson",
};

/**
 * Recursively walk data, strip `promise` from Deferred markers.
 * Ancestry-based cycle detection: add before recurse, delete after.
 * Diamond references (shared objects) are preserved; true cycles become null.
 */
export function serializeLoaderData(data: unknown, ancestors?: WeakSet<object>): unknown {
	if (data === null || data === undefined) return data;
	if (typeof data !== "object") return data;

	const tracking = ancestors ?? new WeakSet<object>();
	if (tracking.has(data as object)) return null;
	tracking.add(data as object);

	let result: unknown;
	if (Array.isArray(data)) {
		result = data.map((item) => serializeLoaderData(item, tracking));
	} else {
		const obj = data as Record<string, unknown>;
		if (isDeferred(obj)) {
			result = { __deferred: true, key: obj.key };
		} else {
			const out: Record<string, unknown> = {};
			for (const key of Object.keys(obj)) {
				out[key] = serializeLoaderData(obj[key], tracking);
			}
			result = out;
		}
	}

	tracking.delete(data as object);
	return result;
}

export function formatLoaderMessage(match: PipelineMatch): string {
	const msg: Record<string, unknown> = {
		d: serializeLoaderData(match.loaderData),
		m: match.matchId,
		t: "l",
	};
	if (match.preloaderContext) {
		for (const k in match.preloaderContext) {
			if (Object.hasOwn(match.preloaderContext, k)) {
				msg.p = match.preloaderContext;
				break;
			}
		}
	}
	try {
		return JSON.stringify(msg);
	} catch {
		return JSON.stringify({
			e: { message: "Serialization failed", name: "Error" },
			m: match.matchId,
			t: "e",
		});
	}
}

export function formatChunkMessage(matchId: string, key: string, data: unknown): string {
	try {
		return JSON.stringify({ d: data, k: key, m: matchId, t: "c" });
	} catch {
		return JSON.stringify({
			e: { message: "Serialization failed", name: "Error" },
			k: key,
			m: matchId,
			t: "e",
		});
	}
}

/* Patterns that indicate system/infra internals — strip from client output */
const SENSITIVE_PATTERNS =
	/(?:SQLITE_|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|getaddrinfo|turso:\/\/|postgres:\/\/|mysql:\/\/|redis:\/\/|mongodb:\/\/|at\s+\S+\s+\(|\.ts:\d+:\d+|\.js:\d+:\d+|node:internal)/i;

function sanitizeErrorMessage(message: string): string {
	if (SENSITIVE_PATTERNS.test(message)) return "An internal error occurred";
	return message;
}

export function formatErrorMessage(matchId: string, error: Error, key?: string): string {
	const msg: Record<string, unknown> = {
		e: { message: sanitizeErrorMessage(error.message), name: error.name },
		m: matchId,
		t: "e",
	};
	if (key !== undefined) {
		msg.k = key;
	}
	return JSON.stringify(msg);
}

export function formatHeadMessage(matchId: string, head: HeadConfig): string {
	try {
		return JSON.stringify({ d: head, m: matchId, t: "h" });
	} catch {
		return JSON.stringify({ d: {}, m: matchId, t: "h" });
	}
}

export function formatRedirectMessage(url: string, status: number, replace?: boolean, external?: boolean): string {
	const msg: Record<string, unknown> = { s: status, t: "x", u: url };
	if (replace !== undefined) {
		msg.r = replace;
	}
	if (external) {
		msg.xl = true;
	}
	return JSON.stringify(msg);
}

export function formatLogMessage(entry: ServerLogEntry): string {
	try {
		const msg: Record<string, unknown> = { a: entry.a, l: entry.l, t: "g" };
		if (entry.s) msg.s = entry.s;
		return JSON.stringify(msg);
	} catch {
		return JSON.stringify({ a: ["[unserializable]"], l: entry.l, t: "g" });
	}
}

export function formatReadyMessage(): string {
	return JSON.stringify({ t: "r" });
}

export function formatQueryCacheMessage(entries: Array<{ data: unknown; key: unknown[]; staleTime?: number }>): string {
	try {
		return JSON.stringify({ d: entries, t: "q" });
	} catch {
		return JSON.stringify({ d: [], t: "q" });
	}
}

export function formatDoneMessage(): string {
	return JSON.stringify({ t: "d" });
}

function buildMatchLines(matches: PipelineMatch[]): string[] {
	const lines: string[] = [];

	/* loader or error messages */
	for (const match of matches) {
		if (match.status === "error" && match.error) {
			lines.push(formatErrorMessage(match.matchId, match.error));
		} else {
			lines.push(formatLoaderMessage(match));
		}
	}

	/* head messages */
	for (const match of matches) {
		if (match.headConfig) {
			lines.push(formatHeadMessage(match.matchId, match.headConfig));
		}
	}

	return lines;
}

export function createNDJSONResponse(config: NDJSONResponseConfig): Response {
	const lines: string[] = [];
	if (config.serverLogs) {
		for (const entry of config.serverLogs) {
			lines.push(formatLogMessage(entry));
		}
	}
	lines.push(...buildMatchLines(config.matches));
	lines.push(formatReadyMessage());
	lines.push(formatDoneMessage());
	let body = "";
	for (const l of lines) {
		body += `${l}\n`;
	}
	return new Response(body, { headers: NDJSON_HEADERS, status: config.status ?? 200 });
}

export function createErrorNDJSONResponse(error: Error, status?: number): Response {
	const http =
		status ??
		(error.name === "UnauthenticatedError"
			? 401
			: error.name === "UnauthorizedError"
				? 403
				: error.name === "NotFoundError"
					? 404
					: 500);
	const lines = [formatErrorMessage("", error), formatReadyMessage(), formatDoneMessage()];
	let body = "";
	for (const l of lines) {
		body += `${l}\n`;
	}
	return new Response(body, { headers: NDJSON_HEADERS, status: http });
}

export function createStreamingNDJSONResponse(config: NDJSONResponseConfig): Response {
	const { deferContexts, matches } = config;
	let cancelled = false;

	const stream = new ReadableStream({
		cancel() {
			cancelled = true;
			if (config.abortController && !config.abortController.signal.aborted) {
				config.abortController.abort();
			}
		},
		async start(controller) {
			const encoder = new TextEncoder();
			const enqueue = (msg: string) => {
				if (cancelled) return;
				controller.enqueue(encoder.encode(`${msg}\n`));
			};

			/* 0. Server log messages */
			if (config.serverLogs) {
				for (const entry of config.serverLogs) {
					enqueue(formatLogMessage(entry));
				}
			}

			/* 1. Loader / error messages */
			for (const match of matches) {
				if (match.status === "error" && match.error) {
					enqueue(formatErrorMessage(match.matchId, match.error));
				} else {
					enqueue(formatLoaderMessage(match));
				}
			}

			/* 2. Head messages */
			for (const match of matches) {
				if (match.headConfig) {
					enqueue(formatHeadMessage(match.matchId, match.headConfig));
				}
			}

			/* 3. Ready */
			enqueue(formatReadyMessage());

			/* 4. Stream deferred chunks */
			const entries: DeferredEntry[] = [];
			for (const ctx of deferContexts.values()) {
				for (const e of ctx.entries()) {
					entries.push(e);
				}
			}

			const streamDeferred = async (
				trackedQC?: { drain(): Array<{ data: unknown; key: unknown[]; staleTime?: number }> },
			) => {
				await Promise.allSettled(
					entries.map(async (entry) => {
						try {
							const data = await entry.promise;
							enqueue(formatChunkMessage(entry.matchId, entry.key, data));
						} catch (e) {
							const err = e instanceof Error ? e : new Error(String(e));
							enqueue(formatErrorMessage(entry.matchId, err, entry.key));
						}

						if (trackedQC) {
							const qcEntries = trackedQC.drain();
							if (qcEntries.length > 0) {
								enqueue(formatQueryCacheMessage(qcEntries));
							}
						}
					}),
				);
			};

			if (config.queryClient) {
				const { withTrackedQueryClient } = await import("../query-client");
				const typed = config.queryClient as Parameters<typeof withTrackedQueryClient>[0];
				await withTrackedQueryClient(typed, streamDeferred);
			} else {
				await streamDeferred();
			}

			/* 5. Done */
			enqueue(formatDoneMessage());
			controller.close();
		},
	});

	return new Response(stream, { headers: NDJSON_HEADERS, status: config.status ?? 200 });
}

export function createRedirectNDJSONResponse(redirect: RedirectResponse): Response {
	const lines = [
		formatRedirectMessage(redirect.url, redirect.status, redirect.replace, redirect.external),
		formatDoneMessage(),
	];
	let body = "";
	for (const l of lines) {
		body += `${l}\n`;
	}
	return new Response(body, { headers: NDJSON_HEADERS, status: 200 });
}
