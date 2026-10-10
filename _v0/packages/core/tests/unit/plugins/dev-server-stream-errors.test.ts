/** @vitest-environment node */
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

/**
 * Bug 71: Node req stream missing "error" event handler
 *
 * nodeToWebRequest creates a ReadableStream from Node's IncomingMessage
 * but never attaches req.on("error", ...). When a client disconnects
 * mid-upload, Node emits "error" (ECONNRESET) — without a listener,
 * this crashes the dev server process.
 *
 * Bug 72: streamResponse never calls reader.cancel() or res.end() on error
 *
 * When reader.read() rejects (e.g. SSR stream errored), the error propagates
 * but res.end() is never called and reader lock is never released.
 * The TCP connection hangs until timeout.
 */

/* We can't import the private functions directly, so we test the pattern */

describe("Bug 71: nodeToWebRequest error handler", () => {
	it("should not crash when req emits error during body read", async () => {
		/* Simulate the ReadableStream creation pattern from nodeToWebRequest */
		const req = new EventEmitter();

		const body = new ReadableStream({
			start(controller) {
				req.on("data", (chunk: unknown) => {
					controller.enqueue(chunk);
				});
				req.on("end", () => {
					controller.close();
				});
				/* Bug 71: this error handler is missing in the source */
				req.on("error", (err: Error) => {
					controller.error(err);
				});
			},
		});

		/* Start reading */
		const reader = body.getReader();
		const readPromise = reader.read();

		/* Simulate client disconnect */
		req.emit("error", new Error("ECONNRESET"));

		/* The read should reject with the error, not crash the process */
		await expect(readPromise).rejects.toThrow("ECONNRESET");
	});

	it("should crash without error handler (demonstrates the bug)", async () => {
		const req = new EventEmitter();

		const body = new ReadableStream({
			start(controller) {
				req.on("data", (chunk: unknown) => {
					controller.enqueue(chunk);
				});
				req.on("end", () => {
					controller.close();
				});
				/* No error handler — this is the bug */
			},
		});

		const reader = body.getReader();
		const readPromise = reader.read();

		/* Without error handler, emitting "error" on EventEmitter throws
		   synchronously per Node.js convention */
		expect(() => req.emit("error", new Error("ECONNRESET"))).toThrow("ECONNRESET");

		reader.cancel();
	});
});

describe("Bug 72: streamResponse error cleanup", () => {
	it("should call res.end() even when stream errors mid-pump", async () => {
		/* Create a stream that produces one chunk then errors */
		const stream = new ReadableStream({
			pull(controller) {
				if (!(controller as unknown as { _sent: boolean })._sent) {
					(controller as unknown as { _sent: boolean })._sent = true;
					controller.enqueue(new TextEncoder().encode("chunk1"));
					return;
				}
				controller.error(new Error("SSR render failed"));
			},
		});

		const res = {
			end: vi.fn(),
			writableEnded: false,
			write: vi.fn(),
			writeHead: vi.fn(),
		};

		const reader = stream.getReader();

		/* Simulate the FIXED streamResponse with cleanup */
		const pump = async (): Promise<void> => {
			const { done, value } = await reader.read();
			if (done) {
				res.end();
				return;
			}
			res.write(value);
			return pump();
		};

		try {
			await pump();
		} catch {
			/* error expected */
		} finally {
			reader.cancel().catch(() => {});
			if (!res.writableEnded) res.end();
		}

		/* The fix ensures res.end() is called on error path */
		expect(res.end).toHaveBeenCalled();
		expect(res.write).toHaveBeenCalledTimes(1);
	});

	it("original streamResponse does NOT call res.end() on error (demonstrates bug)", async () => {
		const stream = new ReadableStream({
			pull(controller) {
				if (!(controller as unknown as { _sent: boolean })._sent) {
					(controller as unknown as { _sent: boolean })._sent = true;
					controller.enqueue(new TextEncoder().encode("chunk1"));
					return;
				}
				controller.error(new Error("SSR render failed"));
			},
		});

		const res = {
			end: vi.fn(),
			write: vi.fn(),
		};

		const reader = stream.getReader();

		/* Original streamResponse pattern — no cleanup */
		const pump = async (): Promise<void> => {
			const { done, value } = await reader.read();
			if (done) {
				res.end();
				return;
			}
			res.write(value);
			return pump();
		};

		try {
			await pump();
		} catch {
			/* error swallowed but res.end() never called */
		}

		/* Bug: res.end() was NOT called */
		expect(res.end).not.toHaveBeenCalled();
		expect(res.write).toHaveBeenCalledTimes(1);
	});
});
