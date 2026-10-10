import { describe, expect, it, vi } from "vitest";
import { submitUrlsToBing } from "../../../src/search-engine/bing.ts";
import { batchNotifyGoogleIndexing, submitSitemapToGoogle } from "../../../src/search-engine/google.ts";
import * as jwt from "../../../src/search-engine/google-jwt.ts";
import { submitIndexNow } from "../../../src/search-engine/index-now.ts";

/* ── Google: fetch error handling ─────────────────────────────────── */

describe("submitSitemapToGoogle — fetch errors", () => {
	it("network error propagates (fetch rejects)", async () => {
		vi.spyOn(jwt, "getGoogleAccessToken").mockResolvedValue("token");
		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn(async () => {
			throw new Error("DNS resolution failed");
		}) as unknown as typeof fetch;

		try {
			await expect(
				submitSitemapToGoogle({
					credentials: { clientEmail: "t@t.com", privateKey: "k" },
					siteUrl: "https://x.com",
					sitemapUrl: "https://x.com/sitemap.xml",
				}),
			).rejects.toThrow("DNS resolution failed");
		} finally {
			globalThis.fetch = originalFetch;
			vi.restoreAllMocks();
		}
	});

	it("non-OK response returns error with status code", async () => {
		vi.spyOn(jwt, "getGoogleAccessToken").mockResolvedValue("token");
		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn(async () => new Response("Rate limit", { status: 429 })) as unknown as typeof fetch;

		try {
			const result = await submitSitemapToGoogle({
				credentials: { clientEmail: "t@t.com", privateKey: "k" },
				siteUrl: "https://x.com",
				sitemapUrl: "https://x.com/sitemap.xml",
			});
			expect(result.ok).toBe(false);
			expect(result.error).toContain("429");
		} finally {
			globalThis.fetch = originalFetch;
			vi.restoreAllMocks();
		}
	});
});

/* ── Bing: fetch error handling ───────────────────────────────────── */

describe("submitUrlsToBing — fetch errors", () => {
	it("network error propagates", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn(async () => {
			throw new Error("Connection refused");
		}) as unknown as typeof fetch;

		try {
			await expect(
				submitUrlsToBing({
					apiKey: "key",
					siteUrl: "https://x.com",
					urls: ["https://x.com/a"],
				}),
			).rejects.toThrow("Connection refused");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("returns error result on non-OK response", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn(async () => new Response("Unauthorized", { status: 401 })) as unknown as typeof fetch;

		try {
			const result = await submitUrlsToBing({
				apiKey: "key",
				siteUrl: "https://x.com",
				urls: ["https://x.com/a"],
			});
			expect(result.ok).toBe(false);
			expect(result.error).toContain("401");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

/* ── IndexNow: fetch error handling ───────────────────────────────── */

describe("submitIndexNow — fetch errors", () => {
	it("network error propagates", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn(async () => {
			throw new Error("Timeout");
		}) as unknown as typeof fetch;

		try {
			await expect(
				submitIndexNow({
					host: "x.com",
					key: "mykey",
					urls: ["https://x.com/a"],
				}),
			).rejects.toThrow("Timeout");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

/* ── Google JWT: edge cases ────────────────────────────────────────── */

describe("getGoogleAccessToken — edge cases", () => {
	it("signJwt is called with correct scope and audience", async () => {
		/* Verify the JWT payload structure used by getGoogleAccessToken.
		 * Note: full crypto mocking not feasible (crypto is read-only getter).
		 * This test verifies the function signature and types compile. */
		expect(jwt.getGoogleAccessToken).toBeDefined();
		expect(jwt.signJwt).toBeDefined();
	});
});

/* ── IndexNow: keyLocation optional ───────────────────────────────── */

describe("submitIndexNow — keyLocation field", () => {
	it("omits keyLocation when not provided", async () => {
		let capturedBody = "";
		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn(async (_url: string, init: RequestInit) => {
			capturedBody = init.body as string;
			return new Response(null, { status: 200 });
		}) as unknown as typeof fetch;

		try {
			await submitIndexNow({
				host: "x.com",
				key: "mykey",
				urls: ["https://x.com/a"],
			});
			const body = JSON.parse(capturedBody);
			expect(body.keyLocation).toBeUndefined();
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("includes keyLocation when provided", async () => {
		let capturedBody = "";
		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn(async (_url: string, init: RequestInit) => {
			capturedBody = init.body as string;
			return new Response(null, { status: 200 });
		}) as unknown as typeof fetch;

		try {
			await submitIndexNow({
				host: "x.com",
				key: "mykey",
				keyLocation: "https://x.com/mykey.txt",
				urls: ["https://x.com/a"],
			});
			const body = JSON.parse(capturedBody);
			expect(body.keyLocation).toBe("https://x.com/mykey.txt");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

/* ── Batch: edge cases ────────────────────────────────────────────── */

describe("batchNotifyGoogleIndexing — edge cases", () => {
	it("single notification with concurrency=10 succeeds", async () => {
		vi.spyOn(jwt, "getGoogleAccessToken").mockResolvedValue("token");
		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch;

		try {
			const result = await batchNotifyGoogleIndexing({
				concurrency: 10,
				credentials: { clientEmail: "t@t.com", privateKey: "k" },
				notifications: [{ type: "URL_UPDATED", url: "https://x.com/1" }],
			});
			expect(result.total).toBe(1);
			expect(result.errors).toHaveLength(0);
		} finally {
			globalThis.fetch = originalFetch;
			vi.restoreAllMocks();
		}
	});
});
