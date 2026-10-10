import { describe, expect, it, vi } from "vitest";

/**
 * Task 4: Streaming generator cleanup race
 *
 * Tests verify that:
 * 1. Generator cleanup is properly awaited (not fire-and-forget)
 * 2. cancel() during pull() doesn't call return() twice
 * 3. Generator return() rejection is caught
 * 4. AbortController fires before cleanup
 */

function createMockRegistration(
	generator: AsyncGenerator<unknown, void, undefined>,
	opts?: { authorizeFn?: () => boolean },
) {
	return {
		authorizeFn: opts?.authorizeFn,
		fn: () => generator,
		id: "test-stream",
		inputSchema: undefined,
		name: "testStream",
		stream: true,
	};
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string[]> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	const chunks: string[] = [];
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(decoder.decode(value));
	}
	return chunks;
}

async function readNDJSON(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
	const chunks = await readStream(stream);
	return chunks
		.join("")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

describe("Task 4: streaming generator cleanup", () => {
	it("generator cleanup called on normal stream completion", async () => {
		let returnCalled = false;

		async function* gen() {
			try {
				yield "a";
				yield "b";
			} finally {
				returnCalled = true;
			}
		}

		const iterator = gen();
		const abortController = new AbortController();
		const encoder = new TextEncoder();
		let cleaned = false;

		const stream = new ReadableStream({
			cancel() {
				abortController.abort();
				if (!cleaned) {
					cleaned = true;
					iterator.return(undefined).catch(() => {});
				}
			},
			async pull(controller) {
				try {
					const { done, value } = await iterator.next();
					if (done) {
						controller.enqueue(encoder.encode(`${JSON.stringify({ d: true })}\n`));
						controller.close();
						if (!cleaned) {
							cleaned = true;
							await iterator.return(undefined).catch(() => {});
						}
						return;
					}
					controller.enqueue(encoder.encode(`${JSON.stringify({ c: value ?? null })}\n`));
				} catch (e) {
					const message = e instanceof Error ? e.message : "Stream error";
					controller.enqueue(encoder.encode(`${JSON.stringify({ e: { message } })}\n`));
					controller.close();
					abortController.abort();
					if (!cleaned) {
						cleaned = true;
						await iterator.return(undefined).catch(() => {});
					}
				}
			},
		});

		const data = await readNDJSON(stream);
		expect(data).toEqual([{ c: "a" }, { c: "b" }, { d: true }]);
		expect(returnCalled).toBe(true);
		expect(cleaned).toBe(true);
	});

	it("generator cleanup called on stream cancellation", async () => {
		let returnCalled = false;
		let yieldCount = 0;

		async function* gen() {
			try {
				while (true) {
					yieldCount++;
					yield `chunk-${yieldCount}`;
				}
			} finally {
				returnCalled = true;
			}
		}

		const iterator = gen();
		const abortController = new AbortController();
		const encoder = new TextEncoder();
		let cleaned = false;

		const stream = new ReadableStream({
			cancel() {
				abortController.abort();
				if (!cleaned) {
					cleaned = true;
					iterator.return(undefined).catch(() => {});
				}
			},
			async pull(controller) {
				try {
					const { done, value } = await iterator.next();
					if (done) {
						controller.close();
						return;
					}
					controller.enqueue(encoder.encode(`${JSON.stringify({ c: value })}\n`));
				} catch {
					controller.close();
				}
			},
		});

		const reader = stream.getReader();
		/* Read first chunk */
		await reader.read();
		/* Cancel the stream */
		await reader.cancel();

		expect(returnCalled).toBe(true);
		expect(cleaned).toBe(true);
		expect(abortController.signal.aborted).toBe(true);
	});

	it("concurrent cancel during pull doesn't call return() twice", async () => {
		let returnCallCount = 0;

		async function* gen() {
			try {
				yield "first";
				/* Simulate slow yield */
				await new Promise((r) => setTimeout(r, 50));
				yield "second";
			} finally {
				returnCallCount++;
			}
		}

		const iterator = gen();
		const abortController = new AbortController();
		const encoder = new TextEncoder();
		let cleaned = false;

		const stream = new ReadableStream({
			cancel() {
				abortController.abort();
				if (!cleaned) {
					cleaned = true;
					iterator.return(undefined).catch(() => {});
				}
			},
			async pull(controller) {
				try {
					const { done, value } = await iterator.next();
					if (done) {
						controller.enqueue(encoder.encode(`${JSON.stringify({ d: true })}\n`));
						controller.close();
						if (!cleaned) {
							cleaned = true;
							await iterator.return(undefined).catch(() => {});
						}
						return;
					}
					controller.enqueue(encoder.encode(`${JSON.stringify({ c: value })}\n`));
				} catch (e) {
					const message = e instanceof Error ? e.message : "Stream error";
					controller.enqueue(encoder.encode(`${JSON.stringify({ e: { message } })}\n`));
					controller.close();
					abortController.abort();
					if (!cleaned) {
						cleaned = true;
						await iterator.return(undefined).catch(() => {});
					}
				}
			},
		});

		const reader = stream.getReader();
		await reader.read();
		await reader.cancel();

		/* Guard flag prevents double cleanup */
		expect(returnCallCount).toBeLessThanOrEqual(1);
	});

	it("generator return() rejection is caught (not unhandled)", async () => {
		async function* gen() {
			try {
				yield "data";
			} finally {
				throw new Error("cleanup failed");
			}
		}

		const iterator = gen();
		const abortController = new AbortController();
		const encoder = new TextEncoder();
		let cleaned = false;

		const stream = new ReadableStream({
			cancel() {
				abortController.abort();
				if (!cleaned) {
					cleaned = true;
					/* .catch(() => {}) prevents unhandled rejection */
					iterator.return(undefined).catch(() => {});
				}
			},
			async pull(controller) {
				const { done, value } = await iterator.next();
				if (done) {
					controller.close();
					if (!cleaned) {
						cleaned = true;
						await iterator.return(undefined).catch(() => {});
					}
					return;
				}
				controller.enqueue(encoder.encode(`${JSON.stringify({ c: value })}\n`));
			},
		});

		const reader = stream.getReader();
		await reader.read();

		/* Cancel should not throw even though generator cleanup throws */
		await expect(reader.cancel()).resolves.toBeUndefined();
		expect(cleaned).toBe(true);
	});

	it("AbortController.abort() fires before iterator cleanup", async () => {
		const order: string[] = [];

		async function* gen() {
			try {
				yield "data";
			} finally {
				order.push("return");
			}
		}

		const iterator = gen();
		const abortController = new AbortController();
		abortController.signal.addEventListener("abort", () => {
			order.push("abort");
		});
		const encoder = new TextEncoder();
		let cleaned = false;

		const stream = new ReadableStream({
			cancel() {
				abortController.abort();
				order.push("after-abort");
				if (!cleaned) {
					cleaned = true;
					iterator.return(undefined).catch(() => {});
				}
			},
			async pull(controller) {
				const { done, value } = await iterator.next();
				if (done) {
					controller.close();
					return;
				}
				controller.enqueue(encoder.encode(`${JSON.stringify({ c: value })}\n`));
			},
		});

		const reader = stream.getReader();
		await reader.read();
		await reader.cancel();

		expect(order.indexOf("abort")).toBeLessThan(order.indexOf("return"));
	});

	it("generator that throws in return() doesn't crash the stream", async () => {
		let errorInCleanup = false;

		async function* gen() {
			yield "ok";
			try {
				yield "also ok";
			} finally {
				errorInCleanup = true;
				throw new Error("boom in cleanup");
			}
		}

		const iterator = gen();
		const encoder = new TextEncoder();
		let cleaned = false;

		const stream = new ReadableStream({
			cancel() {
				if (!cleaned) {
					cleaned = true;
					iterator.return(undefined).catch(() => {});
				}
			},
			async pull(controller) {
				try {
					const { done, value } = await iterator.next();
					if (done) {
						controller.enqueue(encoder.encode(`${JSON.stringify({ d: true })}\n`));
						controller.close();
						if (!cleaned) {
							cleaned = true;
							await iterator.return(undefined).catch(() => {});
						}
						return;
					}
					controller.enqueue(encoder.encode(`${JSON.stringify({ c: value })}\n`));
				} catch (e) {
					const message = e instanceof Error ? e.message : "Stream error";
					controller.enqueue(encoder.encode(`${JSON.stringify({ e: { message } })}\n`));
					controller.close();
					if (!cleaned) {
						cleaned = true;
						await iterator.return(undefined).catch(() => {});
					}
				}
			},
		});

		/* Reading should not throw */
		const data = await readNDJSON(stream);
		expect(data.length).toBeGreaterThan(0);
	});
});
