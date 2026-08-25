import { describe, expect, it } from "vitest";
import { generateSwSource } from "../../../src/service-worker/template.ts";

describe("SW template generation", () => {
	const defaultConfig = {
		offlineFallback: null as string | null,
		runtimeCacheMax: 32,
		skipWaiting: true,
	};

	it("injects precache manifest as array of URL strings", () => {
		const manifest = ["/assets/client-abc.js", "/assets/style-def.css"];
		const result = generateSwSource(manifest, "build123", defaultConfig);

		expect(result).toContain('"/assets/client-abc.js"');
		expect(result).toContain('"/assets/style-def.css"');
	});

	it("injects BUILD_ID into cache name", () => {
		const result = generateSwSource([], "xyz789", defaultConfig);
		expect(result).toContain("flare-assets-xyz789");
	});

	it("injects SW_CONFIG with skipWaiting", () => {
		const result = generateSwSource([], "b1", { ...defaultConfig, skipWaiting: false });
		expect(result).toContain("skipWaiting");
		/* The config should reflect skipWaiting: false */
		expect(result).toMatch(/skipWaiting["']?\s*:\s*false/);
	});

	it("injects offlineFallback path when configured", () => {
		const result = generateSwSource([], "b1", { ...defaultConfig, offlineFallback: "/offline" });
		expect(result).toContain("/offline");
	});

	it("sets offlineFallback to null when not configured", () => {
		const result = generateSwSource([], "b1", defaultConfig);
		expect(result).toMatch(/offlineFallback["']?\s*:\s*null/);
	});

	it("includes install event handler", () => {
		const result = generateSwSource([], "b1", defaultConfig);
		expect(result).toContain("install");
		expect(result).toContain("addAll");
	});

	it("includes activate event handler with old cache cleanup", () => {
		const result = generateSwSource([], "b1", defaultConfig);
		expect(result).toContain("activate");
		expect(result).toContain("flare-assets-");
	});

	it("includes fetch event handler", () => {
		const result = generateSwSource([], "b1", defaultConfig);
		expect(result).toContain("fetch");
	});

	it("does not enable navigationPreload (preload follows redirects and drops 3xx Set-Cookie)", () => {
		const result = generateSwSource([], "b1", defaultConfig);
		expect(result).not.toContain("navigationPreload");
		expect(result).not.toContain("preloadResponse");
	});

	it("includes message handler for SKIP_WAITING", () => {
		const result = generateSwSource([], "b1", defaultConfig);
		expect(result).toContain("SKIP_WAITING");
	});

	it("handles cache-first for /assets/ requests", () => {
		const result = generateSwSource([], "b1", defaultConfig);
		expect(result).toContain("/assets/");
	});

	it("passes through /_flare/ requests", () => {
		const result = generateSwSource([], "b1", defaultConfig);
		expect(result).toContain("/_flare/");
	});

	it("passes through NDJSON requests with flare-data header", () => {
		const result = generateSwSource([], "b1", defaultConfig);
		expect(result).toContain("flare-data");
	});

	it("includes runtimeCacheMax in config", () => {
		const result = generateSwSource([], "b1", { ...defaultConfig, runtimeCacheMax: 64 });
		expect(result).toMatch(/runtimeCacheMax["']?\s*:\s*64/);
	});

	it("generates valid JavaScript", () => {
		const manifest = ["/assets/a.js", "/assets/b.css"];
		const result = generateSwSource(manifest, "abc", defaultConfig);
		/* Should not throw when parsed as a script (basic syntax check) */
		expect(() => new Function(result)).not.toThrow();
	});

	it("includes RUNTIME_CACHE name", () => {
		const result = generateSwSource([], "b1", defaultConfig);
		expect(result).toContain("flare-runtime-v1");
	});

	it("includes clients.claim in activate", () => {
		const result = generateSwSource([], "b1", defaultConfig);
		expect(result).toContain("clients.claim");
	});

	it("navigation fetch does not follow redirects via preloadResponse", () => {
		const result = generateSwSource([], "b1", defaultConfig);
		expect(result).not.toContain("preloadResponse");
	});

	it("passes through keepalive via /_flare/ prefix", () => {
		const result = generateSwSource([], "b1", defaultConfig);
		expect(result).toContain('url.pathname.startsWith("/_flare/")');
	});

	it("checks same-origin before intercepting fetch", () => {
		const result = generateSwSource([], "b1", defaultConfig);
		expect(result).toContain("url.origin");
		expect(result).toContain("self.location.origin");
	});

	it("runtimeCacheMax stays in config even though navigations are not cached", () => {
		const result = generateSwSource([], "b1", defaultConfig);
		expect(result).toContain("runtimeCacheMax");
	});

	it("does not cache navigation HTML (locale Set-Cookie must hit the network)", () => {
		const result = generateSwSource([], "b1", defaultConfig);
		const navigateStart = result.indexOf('"navigate"');
		const navSection = result.slice(navigateStart);
		expect(navSection).not.toContain("cache.put(event.request");
		expect(result).toContain("RUNTIME_CACHE");
	});

	it("falls back to cached HTML on network failure for navigate", () => {
		const result = generateSwSource([], "b1", defaultConfig);
		/* The catch block should try caches.match for the request */
		expect(result).toContain(".catch");
		expect(result).toContain("caches.match(event.request)");
	});

	it("serves offlineFallback when cache miss + network failure", () => {
		const result = generateSwSource([], "b1", {
			...defaultConfig,
			offlineFallback: "/offline",
		});
		expect(result).toContain("offlineFallback");
		expect(result).toContain("caches.match(SW_CONFIG.offlineFallback)");
	});

	it("offline fallback is precached in install event", () => {
		const result = generateSwSource([], "b1", {
			...defaultConfig,
			offlineFallback: "/offline",
		});
		/* Install should fetch + cache the offline fallback */
		expect(result).toContain("fetch(SW_CONFIG.offlineFallback)");
	});

	it("delete old caches matching flare-assets- prefix in activate", () => {
		const result = generateSwSource([], "b1", defaultConfig);
		expect(result).toContain('startsWith("flare-assets-")');
		expect(result).toContain("caches.delete");
	});

	it("only deletes caches not matching current CACHE_NAME", () => {
		const result = generateSwSource([], "b1", defaultConfig);
		expect(result).toContain("!== CACHE_NAME");
	});

	it("cache-first strategy: match then fallback to network + cache", () => {
		const result = generateSwSource([], "b1", defaultConfig);
		/* For /assets/: match first, then fetch + put */
		expect(result).toContain("caches.match(event.request)");
		expect(result).toContain("fetch(event.request)");
		expect(result).toContain("cache.put(event.request");
	});

	it("navigation fetch uses redirect:manual instead of preload follow", () => {
		const result = generateSwSource([], "b1", defaultConfig);
		expect(result).not.toContain("event.preloadResponse");
		expect(result).toContain('redirect: "manual"');
	});

	it("navigation fetch does not auto-follow redirects (Set-Cookie on 3xx must reach the document)", () => {
		const result = generateSwSource([], "b1", defaultConfig);
		const navigateStart = result.indexOf('"navigate"');
		const navSection = result.slice(navigateStart);
		expect(navSection).toContain('redirect: "manual"');
	});

	it("skipWaiting called in install when config.skipWaiting is true", () => {
		const result = generateSwSource([], "b1", { ...defaultConfig, skipWaiting: true });
		/* self.skipWaiting in install handler (conditional on config) */
		expect(result).toContain("SW_CONFIG.skipWaiting");
		expect(result).toContain("self.skipWaiting()");
	});

	it("empty manifest produces valid SW with no precache entries", () => {
		const result = generateSwSource([], "empty1", defaultConfig);
		expect(result).toContain("PRECACHE_MANIFEST = []");
		expect(() => new Function(result)).not.toThrow();
	});

	it("large manifest with many assets still produces valid JS", () => {
		const urls = Array.from({ length: 200 }, (_, i) => `/assets/chunk-${i}.js`);
		const result = generateSwSource(urls, "large1", defaultConfig);
		expect(() => new Function(result)).not.toThrow();
		for (const url of urls.slice(0, 5)) {
			expect(result).toContain(url);
		}
	});

	it("mode navigate check for document requests", () => {
		const result = generateSwSource([], "b1", defaultConfig);
		expect(result).toContain('"navigate"');
	});

	it("has RUNTIME_CACHE as version-stable name", () => {
		/* RUNTIME_CACHE should NOT contain build ID — persists across deploys */
		const result1 = generateSwSource([], "build1", defaultConfig);
		const result2 = generateSwSource([], "build2", defaultConfig);
		expect(result1).toContain('"flare-runtime-v1"');
		expect(result2).toContain('"flare-runtime-v1"');
	});

	it("CACHE_NAME is unique per build", () => {
		const result1 = generateSwSource([], "build1", defaultConfig);
		const result2 = generateSwSource([], "build2", defaultConfig);
		expect(result1).toContain("flare-assets-build1");
		expect(result2).toContain("flare-assets-build2");
	});
});
