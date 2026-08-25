import { HEADER_DATA, INTERNAL_PATH_PREFIX } from "../protocol.ts";

export interface SwTemplateConfig {
	/** URL prefix for cache-first asset matching. Defaults to `"/assets"`. */
	assetsBase?: string;
	offlineFallback: string | null;
	runtimeCacheMax: number;
	skipWaiting: boolean;
}

export function generateSwSource(precacheManifest: string[], buildId: string, config: SwTemplateConfig): string {
	const manifest = JSON.stringify(precacheManifest);
	const assetsBase = config.assetsBase ?? "/assets";
	const swConfig = JSON.stringify({
		assetsBase,
		offlineFallback: config.offlineFallback,
		runtimeCacheMax: config.runtimeCacheMax,
		skipWaiting: config.skipWaiting,
	});

	return `/* Flare Service Worker — generated at build time */
var PRECACHE_MANIFEST = ${manifest}
var SW_CONFIG = ${swConfig}
var BUILD_ID = "${buildId}"
var CACHE_NAME = "flare-assets-${buildId}"
var RUNTIME_CACHE = "flare-runtime-v1"

/* ── Install ─────────────────────────────────────────────────────── */

self.addEventListener("install", function (event) {
	event.waitUntil(
		caches.open(CACHE_NAME).then(function (cache) {
			var promises = [cache.addAll(PRECACHE_MANIFEST)]
			if (SW_CONFIG.offlineFallback) {
				promises.push(
					caches.open(RUNTIME_CACHE).then(function (rtCache) {
						return fetch(SW_CONFIG.offlineFallback).then(function (res) {
							if (res.ok) return rtCache.put(SW_CONFIG.offlineFallback, res)
						}).catch(function () {})
					})
				)
			}
			return Promise.all(promises)
		}).then(function () {
			if (SW_CONFIG.skipWaiting) self.skipWaiting()
		}).catch(function (err) {
			/* Install failed — old SW stays active. Log for debugging. */
			console.error("[flare-sw] install failed:", err)
		})
	)
})

/* ── Activate ────────────────────────────────────────────────────── */

self.addEventListener("activate", function (event) {
	event.waitUntil(
		Promise.all([
			caches.keys().then(function (names) {
				return Promise.all(
					names.filter(function (n) {
						return n.startsWith("flare-assets-") && n !== CACHE_NAME
					}).map(function (n) {
						return caches.delete(n)
					})
				)
			}),
			self.clients.claim(),
		])
	)
})

/* ── Message ─────────────────────────────────────────────────────── */

self.addEventListener("message", function (event) {
	if (event.data && event.data.type === "SKIP_WAITING") {
		self.skipWaiting()
	}
})

/* ── Fetch ───────────────────────────────────────────────────────── */

self.addEventListener("fetch", function (event) {
	var url = new URL(event.request.url)

	/* Only handle same-origin */
	if (url.origin !== self.location.origin) return

	/* Passthrough: NDJSON (flare-data header), Flare internals */
	if (event.request.headers.has(${JSON.stringify(HEADER_DATA)})) return
	if (url.pathname.startsWith(${JSON.stringify(INTERNAL_PATH_PREFIX)})) return

	/* Cache-first for hashed assets under the configured assetsBase */
	if (url.pathname.startsWith(${JSON.stringify(`${assetsBase}/`)})) {
		event.respondWith(
			caches.match(event.request).then(function (cached) {
				if (cached) return cached
				return fetch(event.request).then(function (response) {
					if (response.ok) {
						var clone = response.clone()
						caches.open(CACHE_NAME).then(function (cache) {
							cache.put(event.request, clone)
						}).catch(function () {})
					}
					return response
				})
			}).catch(function () {
				/* Cache API error — fall through to network */
				return fetch(event.request)
			})
		)
		return
	}

	/* Network-only for navigations. redirect:manual so 3xx Set-Cookie
	   (locale strip, cookie-respect) reaches the document. Do not cache
	   HTML — a cached 200 would skip Set-Cookie on the next locale visit.
	   Do not enable navigation preload: it follows redirects and drops 3xx cookies. */
	if (event.request.mode === "navigate") {
		event.respondWith(
			fetch(event.request, { redirect: "manual" }).catch(function () {
				return caches.match(event.request).then(function (cached) {
					if (cached) return cached
					if (SW_CONFIG.offlineFallback) {
						return caches.match(SW_CONFIG.offlineFallback)
					}
					return undefined
				})
			})
		)
		return
	}
})
`;
}
