import { join } from "node:path";
import { weakMatch } from "../server-handler/etag.ts";
import { createFileSystemStore } from "../store/filesystem.ts";
import type { FlareStore, FlareStoreEntry } from "../store/index.ts";
import type { VitePlugin } from "./index.ts";

/* ── Types ───────────────────────────────────────────────────────────── */

export interface CdnCacheEntry {
	body: string;
	headers: Record<string, string>;
	status: number;
	storedAt: number;
	surrogateKeys: string[];
	varyHeaders: string[];
}

export interface ParsedCacheControl {
	maxAge: number | null;
	noStore: boolean;
	private: boolean;
	sMaxAge: number | null;
	staleWhileRevalidate: number | null;
}

/* ── Cache-Control Parsing ───────────────────────────────────────────── */

export function parseCacheControl(header: string | null | undefined): ParsedCacheControl {
	const result: ParsedCacheControl = {
		maxAge: null,
		noStore: false,
		private: false,
		sMaxAge: null,
		staleWhileRevalidate: null,
	};

	if (!header) return result;

	const directives = header.split(",").map((d) => d.trim().toLowerCase());

	for (const directive of directives) {
		if (directive === "no-store") {
			result.noStore = true;
		} else if (directive === "private") {
			result.private = true;
		} else if (directive.startsWith("s-maxage=")) {
			const val = Number.parseInt(directive.slice(9), 10);
			if (!Number.isNaN(val)) result.sMaxAge = val;
		} else if (directive.startsWith("max-age=")) {
			const val = Number.parseInt(directive.slice(8), 10);
			if (!Number.isNaN(val)) result.maxAge = val;
		} else if (directive.startsWith("stale-while-revalidate=")) {
			const val = Number.parseInt(directive.slice(23), 10);
			if (!Number.isNaN(val)) result.staleWhileRevalidate = val;
		}
	}

	return result;
}

/* ── Cache Key Building ──────────────────────────────────────────────── */

/**
 * Build CDN cache key incorporating Vary header dimensions.
 * `cdn:GET:/about` with no Vary, or `cdn:GET:/about:accept-language=en` with Vary.
 */
export function buildCdnCacheKey(
	method: string,
	pathname: string,
	varyHeaders: string[],
	requestHeaders: Record<string, string | undefined>,
): string {
	let key = `cdn:${method}:${pathname}`;

	if (varyHeaders.length > 0) {
		const sorted = [...varyHeaders].sort();
		const parts = sorted.map((h) => {
			const val = requestHeaders[h.toLowerCase()] ?? "";
			return `${h.toLowerCase()}=${val}`;
		});
		key += `:${parts.join(",")}`;
	}

	return key;
}

/**
 * Extract Vary header names from a response, filtering out `*` (uncacheable).
 * Returns empty array if Vary is `*` or absent.
 */
export function parseVaryHeader(header: string | null | undefined): string[] {
	if (!header || header.trim() === "*") return [];
	return header
		.split(",")
		.map((h) => h.trim().toLowerCase())
		.filter((h) => h.length > 0 && h !== "*");
}

/* ── Freshness Check ─────────────────────────────────────────────────── */

export type FreshnessResult =
	| { state: "fresh" }
	| { state: "miss" }
	| { state: "stale-revalidate" }
	| { state: "stale-expired" };

export function checkFreshness(entry: CdnCacheEntry, cc: ParsedCacheControl, now: number): FreshnessResult {
	const age = (now - entry.storedAt) / 1000;
	const maxAge = cc.sMaxAge ?? cc.maxAge;

	if (maxAge === null) return { state: "fresh" };

	if (age <= maxAge) return { state: "fresh" };

	if (cc.staleWhileRevalidate !== null && age <= maxAge + cc.staleWhileRevalidate) {
		return { state: "stale-revalidate" };
	}

	return { state: "stale-expired" };
}

/* ── Surrogate-Key Parsing ───────────────────────────────────────────── */

export function parseSurrogateKey(header: string | null | undefined): string[] {
	if (!header) return [];
	return header
		.split(/\s+/)
		.map((k) => k.trim())
		.filter((k) => k.length > 0);
}

/* ── Store Integration ───────────────────────────────────────────────── */

export function cdnEntryToStoreEntry(entry: CdnCacheEntry): FlareStoreEntry {
	return {
		data: entry,
		storedAt: entry.storedAt,
		tags: entry.surrogateKeys.length > 0 ? entry.surrogateKeys : undefined,
	};
}

export function storeEntryToCdnEntry(entry: FlareStoreEntry): CdnCacheEntry | null {
	const data = entry.data as CdnCacheEntry | undefined;
	if (!data || typeof data !== "object" || !("body" in data)) return null;
	return data;
}

/* ── Cacheable check ─────────────────────────────────────────────────── */

/**
 * Determine if a response should be cached by the CDN.
 * Only caches 2xx GET with explicit max-age/s-maxage, not private/no-store.
 */
export function isCacheable(status: number, cc: ParsedCacheControl): boolean {
	if (status < 200 || status >= 300) return false;
	if (cc.noStore || cc.private) return false;
	return cc.sMaxAge !== null || cc.maxAge !== null;
}

/* ── Vite Plugin ─────────────────────────────────────────────────────── */

interface CdnDevServer {
	config?: { root?: string; server?: { middlewareMode?: boolean } };
	environments?: Record<string, unknown>;
	httpServer?: { on?: (event: string, fn: () => void) => void } | null;
	middlewares: {
		use: (fn: (req: IncomingLike, res: OutgoingLike, next: () => void) => void) => void;
	};
}

export interface IncomingLike {
	headers: Record<string, string | string[] | undefined>;
	method?: string;
	url?: string;
}

export interface OutgoingLike {
	end: (body?: unknown) => void;
	getHeader?: (name: string) => string | string[] | number | undefined;
	headersSent?: boolean;
	on?: (event: string, fn: () => void) => void;
	setHeader?: (name: string, value: string | string[]) => void;
	statusCode?: number;
	write?: (chunk?: unknown) => boolean | undefined;
	writeHead: (status: number, headers?: Record<string, string | string[]>) => void;
}

/**
 * CDN cache simulation middleware for dev mode.
 * Intercepts SSR responses, reads Cache-Control / Vary / Surrogate-Key,
 * and simulates CDN caching with max-age, s-maxage, stale-while-revalidate.
 *
 * Also handles conditional requests (If-None-Match → 304) like a real CDN.
 */
export function createDevCdnCachePlugin(): VitePlugin {
	let store: FlareStore;
	const revalidating = new Set<string>();

	return {
		configureServer(server: unknown) {
			const vite = server as CdnDevServer;
			const root = vite.config?.root ?? process.cwd();
			store = createFileSystemStore({ cacheDir: join(root, ".flare/cache") });

			/* Return post-phase callback — runs AFTER Vite's built-in middleware
			   but BEFORE flare:dev-server (which is next in plugin order).
			   This means CDN cache sits between Vite static serving and Flare SSR. */
			return () => {
				vite.middlewares.use((req, res, next) => {
					handleCdnRequest(req, res, next, store, revalidating).catch(next);
				});
			};
		},
		enforce: "pre",
		name: "flare:dev-cdn-cache",
	};
}

/**
 * Core CDN middleware logic — exported for testing.
 */
export async function handleCdnRequest(
	req: IncomingLike,
	res: OutgoingLike,
	next: () => void,
	store: FlareStore,
	revalidating: Set<string>,
): Promise<void> {
	if (!req.url) {
		next();
		return;
	}

	/* CDN only caches GET requests */
	const method = req.method ?? "GET";
	if (method !== "GET") {
		next();
		return;
	}

	const url = new URL(req.url, `http://${getHeader(req, "host") ?? "localhost"}`);
	const pathname = url.pathname;

	/* Skip static assets (files with extensions like .js, .css, .png) */
	if (pathname.includes(".") && !pathname.endsWith("/")) {
		next();
		return;
	}

	/* Probe cache — first without Vary to discover what Vary headers were stored */
	const probeKey = buildCdnCacheKey(method, pathname, [], {});
	const probeEntry = await store.get(probeKey);
	const probeCdn = probeEntry ? storeEntryToCdnEntry(probeEntry) : null;

	let cacheKey: string;
	let cached: CdnCacheEntry | null = null;

	if (probeCdn && probeCdn.varyHeaders.length > 0) {
		/* Re-key with Vary dimensions from the stored response */
		const reqHeaders = extractRequestHeaders(req, probeCdn.varyHeaders);
		cacheKey = buildCdnCacheKey(method, pathname, probeCdn.varyHeaders, reqHeaders);
		const variedEntry = await store.get(cacheKey);
		cached = variedEntry ? storeEntryToCdnEntry(variedEntry) : null;
	} else if (probeCdn) {
		cacheKey = probeKey;
		cached = probeCdn;
	} else {
		cacheKey = probeKey;
	}

	if (cached && cached.body.includes("html-proxy")) {
		/* Vite-virtualised inline scripts are not a valid cache body — treat as miss. */
		cached = null;
	}

	if (cached) {
		const cc = parseCacheControl(cached.headers["cache-control"]);
		const freshness = checkFreshness(cached, cc, Date.now());

		if (freshness.state === "fresh") {
			/* Conditional request: If-None-Match → 304 */
			const ifNoneMatch = getHeader(req, "if-none-match");
			const etag = cached.headers.etag;
			if (ifNoneMatch && etag && weakMatch(ifNoneMatch, etag)) {
				serve304(res, cached);
				return;
			}

			serveCached(res, cached, "HIT");
			return;
		}

		if (freshness.state === "stale-revalidate") {
			serveCached(res, cached, "STALE");
			/* Background: delete stale entry so next request gets fresh SSR */
			if (!revalidating.has(cacheKey)) {
				revalidating.add(cacheKey);
				store.delete(cacheKey).catch(() => {});
				if (probeCdn && probeCdn.varyHeaders.length > 0) {
					store.delete(probeKey).catch(() => {});
				}
				setTimeout(() => revalidating.delete(cacheKey), 100);
			}
			return;
		}

		/* stale-expired → fall through to SSR */
	}

	/* Cache miss — intercept response from downstream (Flare SSR) */
	interceptResponse(req, res, next, store, method, pathname);
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

function getHeader(req: IncomingLike, name: string): string | undefined {
	const val = req.headers[name];
	return Array.isArray(val) ? val[0] : val;
}

function extractRequestHeaders(req: IncomingLike, varyHeaders: string[]): Record<string, string | undefined> {
	const result: Record<string, string | undefined> = {};
	for (const h of varyHeaders) {
		result[h] = getHeader(req, h);
	}
	return result;
}

function serveCached(res: OutgoingLike, entry: CdnCacheEntry, cacheStatus: string): void {
	const headers: Record<string, string> = { ...entry.headers };
	headers["flare-cdn"] = cacheStatus;
	const age = Math.round((Date.now() - entry.storedAt) / 1000);
	headers.age = String(age);
	res.writeHead(entry.status, headers);
	res.end(entry.body);
}

function serve304(res: OutgoingLike, entry: CdnCacheEntry): void {
	const headers: Record<string, string> = {};
	/* 304 only carries metadata headers, not body headers */
	if (entry.headers.etag) headers.etag = entry.headers.etag;
	if (entry.headers["cache-control"]) headers["cache-control"] = entry.headers["cache-control"];
	if (entry.headers.vary) headers.vary = entry.headers.vary;
	headers["flare-cdn"] = "HIT";
	res.writeHead(304, headers);
	res.end();
}

function chunkToString(chunk: unknown): string {
	if (chunk == null) return "";
	if (typeof chunk === "string") return chunk;
	if (chunk instanceof Uint8Array) return new TextDecoder().decode(chunk);
	if (ArrayBuffer.isView(chunk)) {
		const view = chunk as ArrayBufferView;
		return new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
	}
	return "";
}

function captureHeaderValue(headers: Record<string, string>, key: string, val: string | string[]): void {
	headers[key.toLowerCase()] = Array.isArray(val) ? (val[0] ?? "") : val;
}

function interceptResponse(
	req: IncomingLike,
	res: OutgoingLike,
	next: () => void,
	store: FlareStore,
	method: string,
	pathname: string,
): void {
	const originalWriteHead = res.writeHead.bind(res);
	const originalEnd = res.end.bind(res);
	const originalWrite = res.write?.bind(res);
	const originalSetHeader = res.setHeader?.bind(res);
	let capturedStatus = 200;
	const capturedHeaders: Record<string, string> = {};
	let capturedBody = "";
	let ended = false;
	let wroteHead = false;

	res.writeHead = (status: number, headers?: Record<string, string | string[]>) => {
		wroteHead = true;
		capturedStatus = status;
		if (headers) {
			for (const [key, val] of Object.entries(headers)) {
				captureHeaderValue(capturedHeaders, key, val);
			}
		}
		return originalWriteHead(status, headers);
	};

	if (originalSetHeader) {
		res.setHeader = (name: string, value: string | string[]) => {
			captureHeaderValue(capturedHeaders, name, value);
			return originalSetHeader(name, value);
		};
	}

	if (originalWrite) {
		res.write = (chunk?: unknown) => {
			capturedBody += chunkToString(chunk);
			return originalWrite(chunk);
		};
	}

	res.end = (body?: unknown) => {
		if (ended) return originalEnd(body);
		ended = true;
		capturedBody += chunkToString(body);

		if (!wroteHead && typeof res.statusCode === "number") capturedStatus = res.statusCode;
		const headerFromRes = res.getHeader?.("cache-control");
		if (!capturedHeaders["cache-control"] && headerFromRes != null) {
			captureHeaderValue(
				capturedHeaders,
				"cache-control",
				Array.isArray(headerFromRes) ? headerFromRes : String(headerFromRes),
			);
		}

		const cc = parseCacheControl(capturedHeaders["cache-control"]);

		/* workerd / Cloudflare Vite streams via write(chunk)+end() with no
		   final body. An empty capture is a miss, not a cacheable document. */
		if (isCacheable(capturedStatus, cc) && capturedBody.length > 0 && !capturedBody.includes("html-proxy")) {
			const varyHeaders = parseVaryHeader(capturedHeaders.vary);
			const surrogateKeys = parseSurrogateKey(capturedHeaders["surrogate-key"]);
			const reqHeaders = extractRequestHeaders(req, varyHeaders);
			const cacheKey = buildCdnCacheKey(method, pathname, varyHeaders, reqHeaders);

			const entry: CdnCacheEntry = {
				body: capturedBody,
				headers: capturedHeaders,
				status: capturedStatus,
				storedAt: Date.now(),
				surrogateKeys,
				varyHeaders,
			};

			store.set(cacheKey, cdnEntryToStoreEntry(entry)).catch(() => {});

			/* Also store a probe entry for Vary discovery on next lookup */
			if (varyHeaders.length > 0) {
				const probeKey = buildCdnCacheKey(method, pathname, [], {});
				store.set(probeKey, cdnEntryToStoreEntry(entry)).catch(() => {});
			}
		}

		return originalEnd(body);
	};

	next();
}
