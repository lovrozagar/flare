import { describe, expect, it, vi } from "vitest";
import { submitUrlsToBing } from "../../../src/search-engine/bing.ts";

describe("submitUrlsToBing", () => {
	it("sends correct batch body with apikey in URL", async () => {
		let capturedUrl = "";
		let capturedBody = "";
		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn(async (url: string, init: RequestInit) => {
			capturedUrl = url;
			capturedBody = init.body as string;
			return new Response(null, { status: 200 });
		}) as unknown as typeof fetch;

		try {
			const result = await submitUrlsToBing({
				apiKey: "my-api-key",
				siteUrl: "https://example.com",
				urls: ["https://example.com/page1", "https://example.com/page2"],
			});

			expect(result.ok).toBe(true);
			expect(capturedUrl).toContain("apikey=my-api-key");
			expect(capturedUrl).toContain("ssl.bing.com");

			const body = JSON.parse(capturedBody);
			expect(body.siteUrl).toBe("https://example.com");
			expect(body.urlList).toEqual(["https://example.com/page1", "https://example.com/page2"]);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("returns error on failure", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn(async () => new Response("rate limited", { status: 429 })) as unknown as typeof fetch;

		try {
			const result = await submitUrlsToBing({
				apiKey: "key",
				siteUrl: "https://example.com",
				urls: ["https://example.com/page"],
			});
			expect(result.ok).toBe(false);
			expect(result.error).toContain("429");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
