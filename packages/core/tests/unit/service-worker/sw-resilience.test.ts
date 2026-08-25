import { describe, expect, it } from "vitest";
import { generateSwSource, type SwTemplateConfig } from "../../../src/service-worker/template.ts";

const defaultConfig: SwTemplateConfig = {
	offlineFallback: null,
	runtimeCacheMax: 32,
	skipWaiting: true,
};

describe("SW resilience — fetch handler error safety", () => {
	it("assets handler has .catch() for cache API errors", () => {
		const result = generateSwSource([], "b1", defaultConfig);
		/* Extract the /assets/ respondWith block */
		const assetsStart = result.indexOf('"/assets/"');
		const navigateStart = result.indexOf('"navigate"');
		const assetsSection = result.slice(assetsStart, navigateStart);
		/* Must have catch for cache errors — falls through to network */
		expect(assetsSection).toContain(".catch");
		expect(assetsSection).toContain("fetch(event.request)");
	});

	it("navigation handler has .catch() for offline fallback", () => {
		const result = generateSwSource([], "b1", defaultConfig);
		const navigateStart = result.indexOf('"navigate"');
		const navSection = result.slice(navigateStart);
		expect(navSection).toContain(".catch");
		expect(navSection).toContain("caches.match(event.request)");
	});
});

describe("SW resilience — cache.put() error handling", () => {
	it("cache.put() in assets handler has .catch()", () => {
		const result = generateSwSource([], "b1", defaultConfig);
		const assetsStart = result.indexOf('"/assets/"');
		const navigateStart = result.indexOf('"navigate"');
		const assetsSection = result.slice(assetsStart, navigateStart);
		/* cache.put chain should have error handling for quota exceeded */
		const putIdx = assetsSection.indexOf("cache.put");
		const afterPut = assetsSection.slice(putIdx);
		expect(afterPut).toContain(".catch");
	});

	it("navigation handler does not cache.put HTML (locale Set-Cookie must hit the network)", () => {
		const result = generateSwSource([], "b1", defaultConfig);
		const navigateStart = result.indexOf('"navigate"');
		const navSection = result.slice(navigateStart);
		expect(navSection).not.toContain("cache.put");
	});
});

describe("SW resilience — install error handling", () => {
	it("install handler catches failures with .catch()", () => {
		const result = generateSwSource([], "b1", defaultConfig);
		const installStart = result.indexOf('"install"');
		const activateStart = result.indexOf('"activate"');
		const installSection = result.slice(installStart, activateStart);
		expect(installSection).toContain(".catch");
	});

	it("install catch logs error for debugging", () => {
		const result = generateSwSource([], "b1", defaultConfig);
		const installStart = result.indexOf('"install"');
		const activateStart = result.indexOf('"activate"');
		const installSection = result.slice(installStart, activateStart);
		expect(installSection).toContain("console.error");
		expect(installSection).toContain("flare-sw");
	});

	it("offline fallback fetch failure is caught", () => {
		const result = generateSwSource([], "b1", {
			...defaultConfig,
			offlineFallback: "/offline",
		});
		expect(result).toContain("fetch(SW_CONFIG.offlineFallback)");
		const installStart = result.indexOf('"install"');
		const activateStart = result.indexOf('"activate"');
		const installSection = result.slice(installStart, activateStart);
		expect(installSection).toContain(".catch");
	});
});

describe("SW resilience — LRU batch eviction", () => {
	it("navigation handler does not LRU-cache HTML", () => {
		const result = generateSwSource([], "b1", defaultConfig);
		const navigateStart = result.indexOf('"navigate"');
		const navSection = result.slice(navigateStart);
		expect(navSection).not.toContain("while");
		expect(navSection).not.toContain("cache.put");
	});

	it("generated JS with batch eviction is syntactically valid", () => {
		const result = generateSwSource(["/assets/a.js"], "test1", {
			...defaultConfig,
			runtimeCacheMax: 10,
		});
		expect(() => new Function(result)).not.toThrow();
	});
});
