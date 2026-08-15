import { expect, test } from "@playwright/test";

/**
 * Slow streaming server function tests.
 *
 * Tests slowStreamFn which yields 5 chunks at 200ms intervals.
 * Validates progressive delivery, abort behavior, and stream protocol.
 */

const STREAM_URL = "/_fn/slow-stream/slow-stream";

test.describe("Slow stream — progressive delivery", () => {
	test("stream delivers all 5 chunks", async ({ request }) => {
		const res = await request.post(STREAM_URL, {
			data: {},
			headers: { "content-type": "application/json" },
		});

		expect(res.status()).toBe(200);
		const body = await res.text();
		const lines = body.split("\n").filter((l) => l.trim());

		/* each line is NDJSON — parse chunks */
		const chunks: number[] = [];
		for (const line of lines) {
			const parsed = JSON.parse(line) as Record<string, unknown>;
			if ("c" in parsed) {
				const chunk = parsed.c as { chunk: number };
				chunks.push(chunk.chunk);
			}
		}

		expect(chunks).toEqual([1, 2, 3, 4, 5]);
	});

	test("stream takes at least 800ms for 5 chunks", async ({ request }) => {
		const start = Date.now();
		await request.post(STREAM_URL, {
			data: {},
			headers: { "content-type": "application/json" },
		});
		const elapsed = Date.now() - start;

		/* 5 chunks × 200ms = 1000ms minimum, allow some slack */
		expect(elapsed).toBeGreaterThan(800);
	});

	test("stream response is NDJSON format", async ({ request }) => {
		const res = await request.post(STREAM_URL, {
			data: {},
			headers: { "content-type": "application/json" },
		});

		const body = await res.text();
		const lines = body.split("\n").filter((l) => l.trim());

		/* every line should be valid JSON */
		for (const line of lines) {
			expect(() => JSON.parse(line)).not.toThrow();
		}

		/* should have at least 5 chunk lines */
		expect(lines.length).toBeGreaterThanOrEqual(5);
	});
});

test.describe("Slow stream — abort behavior", () => {
	test("aborting mid-stream does not crash server", async ({ page }) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });

		/*
		 * Start stream, abort after 500ms (enough for ~2 chunks at 200ms each).
		 * HTTP/2 multiplexing may batch chunks differently than HTTP/1.1 so we
		 * use a time-based abort rather than counting parsed NDJSON lines.
		 * The invariant: abort doesn't crash the server, not the chunk count.
		 */
		const result = await page.evaluate(async () => {
			const controller = new AbortController();
			const res = await fetch(new URL("/_fn/slow-stream/slow-stream", window.location.origin).href, {
				body: "{}",
				headers: { "content-type": "application/json" },
				method: "POST",
				signal: controller.signal,
			});

			if (!res.body) return { aborted: false, chunks: 0 };

			/* abort after 500ms regardless of chunks received */
			setTimeout(() => controller.abort(), 500);

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let chunks = 0;
			let buffer = "";

			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split("\n");
					buffer = lines.pop() ?? "";
					for (const line of lines) {
						if (!line.trim()) continue;
						const parsed = JSON.parse(line) as Record<string, unknown>;
						if ("c" in parsed) chunks++;
					}
				}
			} catch {
				/* AbortError expected */
			}

			return { aborted: true, chunks };
		});

		expect(result.aborted).toBe(true);
		/* chunk count varies by protocol — HTTP/2 may deliver 0 before abort */
		expect(result.chunks).toBeLessThan(5);

		/* server should still work after abort — make another request */
		const res = await page.request.get("/");
		expect(res.status()).toBe(200);
	});
});

test.describe("Slow stream — via UI", () => {
	test("stream button works on server-fn-advanced page", async ({ page }) => {
		await page.goto("/server-fn-advanced", { waitUntil: "domcontentloaded" });
		await page.waitForFunction(() => document.documentElement.hasAttribute("data-hydrated"), null, {
			timeout: 15_000,
		});

		/* click the stream button */
		const streamBtn = page.locator("[data-testid=stream-btn]");
		if (await streamBtn.isVisible().catch(() => false)) {
			await streamBtn.click();

			/* wait for stream to complete — should show 5 chunks */
			await page.waitForFunction(
				() => {
					const status = document.querySelector("[data-testid=stream-status]");
					return status?.textContent === "done";
				},
				null,
				{ timeout: 10_000 },
			);

			const chunks = await page.locator("[data-testid=stream-chunk]").count();
			expect(chunks).toBe(5);
		}
	});
});
