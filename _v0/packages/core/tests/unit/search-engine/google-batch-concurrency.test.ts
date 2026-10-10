import { describe, expect, it, vi } from "vitest";
import { batchNotifyGoogleIndexing } from "../../../src/search-engine/google.ts";
import * as jwt from "../../../src/search-engine/google-jwt.ts";

/* ── Concurrency validation for batchNotifyGoogleIndexing ─────────── */

describe("batchNotifyGoogleIndexing — concurrency", () => {
	it("concurrency=3 processes all items exactly once", async () => {
		vi.spyOn(jwt, "getGoogleAccessToken").mockResolvedValue("test-token");
		const processedUrls: string[] = [];
		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn(async (_url: string, init: RequestInit) => {
			const body = JSON.parse(init.body as string) as { url: string };
			processedUrls.push(body.url);
			return new Response(null, { status: 200 });
		}) as unknown as typeof fetch;

		try {
			const notifications = Array.from({ length: 10 }, (_, i) => ({
				type: "URL_UPDATED" as const,
				url: `https://example.com/${i}`,
			}));
			const result = await batchNotifyGoogleIndexing({
				concurrency: 3,
				credentials: { clientEmail: "test@test.com", privateKey: "key" },
				notifications,
			});

			expect(result.total).toBe(10);
			expect(processedUrls).toHaveLength(10);
			/* every URL processed exactly once */
			const unique = new Set(processedUrls);
			expect(unique.size).toBe(10);
			for (let i = 0; i < 10; i++) {
				expect(unique.has(`https://example.com/${i}`)).toBe(true);
			}
		} finally {
			globalThis.fetch = originalFetch;
			vi.restoreAllMocks();
		}
	});

	it("concurrency > notifications.length still works", async () => {
		vi.spyOn(jwt, "getGoogleAccessToken").mockResolvedValue("test-token");
		const processedUrls: string[] = [];
		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn(async (_url: string, init: RequestInit) => {
			const body = JSON.parse(init.body as string) as { url: string };
			processedUrls.push(body.url);
			return new Response(null, { status: 200 });
		}) as unknown as typeof fetch;

		try {
			const result = await batchNotifyGoogleIndexing({
				concurrency: 50,
				credentials: { clientEmail: "test@test.com", privateKey: "key" },
				notifications: [
					{ type: "URL_UPDATED", url: "https://example.com/a" },
					{ type: "URL_UPDATED", url: "https://example.com/b" },
				],
			});

			expect(result.total).toBe(2);
			expect(processedUrls).toHaveLength(2);
		} finally {
			globalThis.fetch = originalFetch;
			vi.restoreAllMocks();
		}
	});

	it("concurrent workers never duplicate items", async () => {
		vi.spyOn(jwt, "getGoogleAccessToken").mockResolvedValue("test-token");
		const seen = new Map<string, number>();
		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn(async (_url: string, init: RequestInit) => {
			const body = JSON.parse(init.body as string) as { url: string };
			seen.set(body.url, (seen.get(body.url) ?? 0) + 1);
			/* small delay to interleave workers */
			await new Promise((r) => setTimeout(r, 1));
			return new Response(null, { status: 200 });
		}) as unknown as typeof fetch;

		try {
			const notifications = Array.from({ length: 20 }, (_, i) => ({
				type: "URL_UPDATED" as const,
				url: `https://example.com/${i}`,
			}));
			await batchNotifyGoogleIndexing({
				concurrency: 5,
				credentials: { clientEmail: "test@test.com", privateKey: "key" },
				notifications,
			});

			/* each URL exactly once */
			for (const [url, count] of seen) {
				expect(count, `${url} processed ${count} times`).toBe(1);
			}
			expect(seen.size).toBe(20);
		} finally {
			globalThis.fetch = originalFetch;
			vi.restoreAllMocks();
		}
	});

	it("errors from concurrent workers are all collected", async () => {
		vi.spyOn(jwt, "getGoogleAccessToken").mockResolvedValue("test-token");
		let callIdx = 0;
		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn(async () => {
			callIdx++;
			/* every odd request fails */
			if (callIdx % 2 === 1) return new Response("fail", { status: 500 });
			return new Response(null, { status: 200 });
		}) as unknown as typeof fetch;

		try {
			const notifications = Array.from({ length: 10 }, (_, i) => ({
				type: "URL_UPDATED" as const,
				url: `https://example.com/${i}`,
			}));
			const result = await batchNotifyGoogleIndexing({
				concurrency: 3,
				credentials: { clientEmail: "test@test.com", privateKey: "key" },
				notifications,
			});

			expect(result.total).toBe(10);
			expect(result.errors.length).toBe(5);
		} finally {
			globalThis.fetch = originalFetch;
			vi.restoreAllMocks();
		}
	});

	it("empty notifications array", async () => {
		vi.spyOn(jwt, "getGoogleAccessToken").mockResolvedValue("test-token");
		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch;

		try {
			const result = await batchNotifyGoogleIndexing({
				credentials: { clientEmail: "test@test.com", privateKey: "key" },
				notifications: [],
			});

			expect(result.total).toBe(0);
			expect(result.errors).toHaveLength(0);
		} finally {
			globalThis.fetch = originalFetch;
			vi.restoreAllMocks();
		}
	});

	it("single notification with default concurrency", async () => {
		vi.spyOn(jwt, "getGoogleAccessToken").mockResolvedValue("test-token");
		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch;

		try {
			const result = await batchNotifyGoogleIndexing({
				credentials: { clientEmail: "test@test.com", privateKey: "key" },
				notifications: [{ type: "URL_UPDATED", url: "https://example.com/x" }],
			});

			expect(result.total).toBe(1);
			expect(result.errors).toHaveLength(0);
		} finally {
			globalThis.fetch = originalFetch;
			vi.restoreAllMocks();
		}
	});
});
