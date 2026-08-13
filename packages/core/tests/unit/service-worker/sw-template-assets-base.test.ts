/** @vitest-environment node */
import { describe, expect, it } from "vitest"
import { generateSwSource } from "../../../src/service-worker/template.ts"

describe("service worker cache rule assetsBase", () => {
	it("service-worker-cache-rule-default", () => {
		const src = generateSwSource(["/assets/client-abc.js"], "build1", {
			assetsBase: "/assets",
			offlineFallback: null,
			runtimeCacheMax: 32,
			skipWaiting: true,
		})
		expect(src).toContain('url.pathname.startsWith("/assets/")')
	})

	it("service-worker-cache-rule-custom", () => {
		const src = generateSwSource(["/app/assets/client-abc.js"], "build1", {
			assetsBase: "/app/assets",
			offlineFallback: null,
			runtimeCacheMax: 32,
			skipWaiting: true,
		})
		expect(src).toContain('url.pathname.startsWith("/app/assets/")')
		expect(src).not.toContain('url.pathname.startsWith("/assets/")')
	})
})
