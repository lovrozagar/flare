import { describe, expect, it, vi } from "vitest";
import { RedirectResponse } from "../../../src/errors/index.ts";
import { fetchNDJSON } from "../../../src/ndjson-client/index.ts";

function createMockResponse(lines: string[]): Response {
	const body = `${lines.join("\n")}\n`;
	const encoder = new TextEncoder();
	const encoded = encoder.encode(body);

	let read = false;
	const reader = {
		cancel: vi.fn(),
		read: vi.fn(() => {
			if (!read) {
				read = true;
				return { done: false, value: encoded };
			}
			return { done: true, value: undefined };
		}),
	};

	return {
		body: { getReader: () => reader },
		ok: true,
	} as unknown as Response;
}

function createChunkedResponse(chunks: Uint8Array[]): Response {
	let idx = 0;
	const reader = {
		cancel: vi.fn(),
		read: vi.fn(() => {
			if (idx < chunks.length) {
				const value = chunks[idx];
				idx++;
				return { done: false, value };
			}
			return { done: true, value: undefined };
		}),
	};

	return {
		body: { getReader: () => reader },
		ok: true,
	} as unknown as Response;
}

function line(obj: Record<string, unknown>): string {
	return JSON.stringify(obj);
}

/* ── malformed JSON handling ─────────────────────────────────────── */

describe("malformed JSON in NDJSON stream", () => {
	it("invalid JSON line skipped, valid lines still processed", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([
					line({ d: "data1", m: "m1", t: "l" }),
					"{ this is not valid json }}}",
					line({ t: "r" }),
					line({ t: "d" }),
				]),
			);
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchNDJSON({ url: "/api" });
		expect(result.matches).toHaveLength(1);
		expect(result.matches[0]?.loaderData).toBe("data1");
		expect(result.success).toBe(true);

		vi.unstubAllGlobals();
	});

	it("empty lines are silently skipped", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(createMockResponse(["", line({ d: "data1", m: "m1", t: "l" }), "   ", line({ t: "d" })]));
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchNDJSON({ url: "/api" });
		expect(result.matches).toHaveLength(1);
		expect(result.success).toBe(true);

		vi.unstubAllGlobals();
	});

	it("JSON missing t field → skipped as invalid", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([line({ d: "data", m: "m1" }), line({ d: "real", m: "m2", t: "l" }), line({ t: "d" })]),
			);
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchNDJSON({ url: "/api" });
		expect(result.matches).toHaveLength(1);
		expect(result.matches[0]?.matchId).toBe("m2");

		vi.unstubAllGlobals();
	});

	it("JSON array instead of object → skipped", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(createMockResponse(["[1, 2, 3]", line({ d: "data", m: "m1", t: "l" }), line({ t: "d" })]));
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchNDJSON({ url: "/api" });
		expect(result.matches).toHaveLength(1);

		vi.unstubAllGlobals();
	});

	it("JSON null → skipped", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(createMockResponse(["null", line({ d: "data", m: "m1", t: "l" }), line({ t: "d" })]));
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchNDJSON({ url: "/api" });
		expect(result.matches).toHaveLength(1);

		vi.unstubAllGlobals();
	});
});

/* ── HTTP error status ───────────────────────────────────────────── */

describe("HTTP error status handling", () => {
	it("500 response returns success=false with empty matches", async () => {
		const fetchSpy = vi.fn().mockResolvedValue({
			body: {
				getReader: () => ({
					cancel: vi.fn(),
					read: vi.fn(() => ({ done: true, value: undefined })),
				}),
			},
			ok: false,
			status: 500,
		} as unknown as Response);
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchNDJSON({ url: "/api" });
		expect(result.success).toBe(false);
		expect(result.matches).toEqual([]);

		vi.unstubAllGlobals();
	});

	it("404 response returns success=false", async () => {
		const fetchSpy = vi.fn().mockResolvedValue({
			body: {
				getReader: () => ({
					cancel: vi.fn(),
					read: vi.fn(() => ({ done: true, value: undefined })),
				}),
			},
			ok: false,
			status: 404,
		} as unknown as Response);
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchNDJSON({ url: "/api" });
		expect(result.success).toBe(false);

		vi.unstubAllGlobals();
	});
});

/* ── no response body ────────────────────────────────────────────── */

describe("no response body", () => {
	it("response with null body → empty matches, success=false", async () => {
		const fetchSpy = vi.fn().mockResolvedValue({
			body: null,
			ok: true,
		} as unknown as Response);
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchNDJSON({ url: "/api" });
		expect(result.matches).toEqual([]);
		expect(result.success).toBe(false);

		vi.unstubAllGlobals();
	});
});

/* ── stream split across chunks ──────────────────────────────────── */

describe("stream split across chunks", () => {
	it("JSON line split across two chunks", async () => {
		const encoder = new TextEncoder();
		/* Split the JSON line in the middle */
		const fullLine = line({ d: "split-data", m: "m1", t: "l" });
		const mid = Math.floor(fullLine.length / 2);

		const chunks = [
			encoder.encode(`${fullLine.slice(0, mid)}`),
			encoder.encode(`${fullLine.slice(mid)}\n${line({ t: "d" })}\n`),
		];

		const fetchSpy = vi.fn().mockResolvedValue(createChunkedResponse(chunks));
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchNDJSON({ url: "/api" });
		expect(result.matches).toHaveLength(1);
		expect(result.matches[0]?.loaderData).toBe("split-data");

		vi.unstubAllGlobals();
	});

	it("multiple JSON lines in single chunk", async () => {
		const encoder = new TextEncoder();
		const allLines = [
			line({ d: "d1", m: "m1", t: "l" }),
			line({ d: "d2", m: "m2", t: "l" }),
			line({ t: "r" }),
			line({ t: "d" }),
		].join("\n");

		const chunks = [encoder.encode(`${allLines}\n`)];
		const fetchSpy = vi.fn().mockResolvedValue(createChunkedResponse(chunks));
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchNDJSON({ url: "/api" });
		expect(result.matches).toHaveLength(2);
		expect(result.matches[0]?.loaderData).toBe("d1");
		expect(result.matches[1]?.loaderData).toBe("d2");

		vi.unstubAllGlobals();
	});

	it("last line without trailing newline still processed on stream end", async () => {
		const encoder = new TextEncoder();
		/* No trailing newline — line stays in buffer until stream ends */
		const chunk = encoder.encode(line({ d: "buffered", m: "m1", t: "l" }));
		const doneChunk = encoder.encode(`\n${line({ t: "d" })}`);

		const fetchSpy = vi.fn().mockResolvedValue(createChunkedResponse([chunk, doneChunk]));
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchNDJSON({ url: "/api" });
		expect(result.matches).toHaveLength(1);
		expect(result.matches[0]?.loaderData).toBe("buffered");

		vi.unstubAllGlobals();
	});
});

/* ── redirect handling ───────────────────────────────────────────── */

describe("redirect in NDJSON stream", () => {
	it("redirect message throws RedirectResponse", async () => {
		const fetchSpy = vi.fn().mockResolvedValue(createMockResponse([line({ s: 302, t: "x", u: "/login" })]));
		vi.stubGlobal("fetch", fetchSpy);

		await expect(fetchNDJSON({ url: "/api" })).rejects.toThrow(RedirectResponse);

		vi.unstubAllGlobals();
	});

	it("redirect with xl=true sets external=true and url=href", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(createMockResponse([line({ s: 301, t: "x", u: "https://external.com", xl: true })]));
		vi.stubGlobal("fetch", fetchSpy);

		try {
			await fetchNDJSON({ url: "/api" });
			expect.fail("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(RedirectResponse);
			const rr = e as RedirectResponse;
			expect(rr.url).toBe("https://external.com");
			expect(rr.external).toBe(true);
		}

		vi.unstubAllGlobals();
	});

	it("redirect mid-stream cancels reader", async () => {
		let readerCancelled = false;
		const encoder = new TextEncoder();
		const body = `${line({ d: "data1", m: "m1", t: "l" })}\n${line({ s: 302, t: "x", u: "/redirect" })}\n`;
		let read = false;
		const reader = {
			cancel: vi.fn(() => {
				readerCancelled = true;
			}),
			read: vi.fn(() => {
				if (!read) {
					read = true;
					return { done: false, value: encoder.encode(body) };
				}
				return { done: true, value: undefined };
			}),
		};

		const fetchSpy = vi.fn().mockResolvedValue({
			body: { getReader: () => reader },
			ok: true,
		});
		vi.stubGlobal("fetch", fetchSpy);

		await expect(fetchNDJSON({ url: "/api" })).rejects.toThrow(RedirectResponse);
		expect(readerCancelled).toBe(true);

		vi.unstubAllGlobals();
	});
});

/* ── error message reconstruction ────────────────────────────────── */

describe("error reconstruction", () => {
	it("error with name=NotFoundError reconstructs as NotFoundError", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([
					line({ e: { message: "not found", name: "NotFoundError" }, m: "m1", t: "e" }),
					line({ t: "d" }),
				]),
			);
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchNDJSON({ url: "/api" });
		expect(result.matches[0]?.error?.constructor.name).toBe("NotFoundError");
		expect(result.matches[0]?.error?.message).toBe("not found");

		vi.unstubAllGlobals();
	});

	it("error with name=UnauthenticatedError", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([
					line({ e: { message: "401", name: "UnauthenticatedError" }, m: "m1", t: "e" }),
					line({ t: "d" }),
				]),
			);
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchNDJSON({ url: "/api" });
		expect(result.matches[0]?.error?.constructor.name).toBe("UnauthenticatedError");

		vi.unstubAllGlobals();
	});

	it("error with name=UnauthorizedError", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([
					line({ e: { message: "403", name: "UnauthorizedError" }, m: "m1", t: "e" }),
					line({ t: "d" }),
				]),
			);
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchNDJSON({ url: "/api" });
		expect(result.matches[0]?.error?.constructor.name).toBe("UnauthorizedError");

		vi.unstubAllGlobals();
	});

	it("error with unknown name creates generic Error with custom name", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([
					line({ e: { message: "custom", name: "CustomError" }, m: "m1", t: "e" }),
					line({ t: "d" }),
				]),
			);
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchNDJSON({ url: "/api" });
		expect(result.matches[0]?.error).toBeInstanceOf(Error);
		expect(result.matches[0]?.error?.name).toBe("CustomError");
		expect(result.matches[0]?.error?.message).toBe("custom");

		vi.unstubAllGlobals();
	});

	it("error with no name uses generic Error", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(createMockResponse([line({ e: { message: "oops" }, m: "m1", t: "e" }), line({ t: "d" })]));
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchNDJSON({ url: "/api" });
		expect(result.matches[0]?.error).toBeInstanceOf(Error);
		expect(result.matches[0]?.error?.name).toBe("Error");

		vi.unstubAllGlobals();
	});

	it("error with no e field → Unknown error message", async () => {
		const fetchSpy = vi.fn().mockResolvedValue(createMockResponse([line({ m: "m1", t: "e" }), line({ t: "d" })]));
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchNDJSON({ url: "/api" });
		expect(result.matches[0]?.error?.message).toBe("Unknown error");

		vi.unstubAllGlobals();
	});
});

/* ── signal abort handling ───────────────────────────────────────── */

describe("signal abort handling", () => {
	it("pre-aborted signal cancels reader immediately", async () => {
		const controller = new AbortController();
		controller.abort();

		const readerCancel = vi.fn();
		const fetchSpy = vi.fn().mockResolvedValue({
			body: {
				getReader: () => ({
					cancel: readerCancel,
					read: vi.fn(() => ({ done: true, value: undefined })),
				}),
			},
			ok: true,
		});
		vi.stubGlobal("fetch", fetchSpy);

		const _result = await fetchNDJSON({ signal: controller.signal, url: "/api" });
		expect(readerCancel).toHaveBeenCalled();

		vi.unstubAllGlobals();
	});
});

/* ── deferred chunk resolution ───────────────────────────────────── */

describe("deferred chunk resolution in stream", () => {
	it("deferred chunk resolves matching resolver", async () => {
		let _resolvedValue: unknown;
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([
					line({ d: { __deferred: true, __key: "d0" }, m: "m1", t: "l" }),
					line({ t: "r" }),
					line({ d: "resolved-value", k: "d0", m: "m1", t: "c" }),
					line({ t: "d" }),
				]),
			);
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchNDJSON({ url: "/api" });
		/* The deferred marker should have been hydrated with a promise resolver */
		expect(result.matches).toHaveLength(1);
		expect(result.success).toBe(true);

		vi.unstubAllGlobals();
	});

	it("error chunk with key rejects matching resolver", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([
					line({ d: { __deferred: true, __key: "d0" }, m: "m1", t: "l" }),
					line({ t: "r" }),
					line({ e: { message: "fail" }, k: "d0", m: "m1", t: "e" }),
					line({ t: "d" }),
				]),
			);
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchNDJSON({ url: "/api" });
		/* Match should exist from loader message */
		expect(result.matches).toHaveLength(1);

		vi.unstubAllGlobals();
	});

	it("chunk for nonexistent resolver is silently ignored", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([
					line({ d: "plain-data", m: "m1", t: "l" }),
					line({ t: "r" }),
					line({ d: "orphan", k: "nonexistent", m: "m1", t: "c" }),
					line({ t: "d" }),
				]),
			);
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchNDJSON({ url: "/api" });
		expect(result.matches).toHaveLength(1);
		expect(result.success).toBe(true);

		vi.unstubAllGlobals();
	});
});

/* ── head messages ───────────────────────────────────────────────── */

describe("head messages in stream", () => {
	it("head message with valid object adds to perRouteHeads", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(createMockResponse([line({ d: { title: "Page" }, m: "m1", t: "h" }), line({ t: "d" })]));
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchNDJSON({ url: "/api" });
		expect(result.perRouteHeads).toHaveLength(1);
		expect(result.perRouteHeads[0]?.head).toEqual({ title: "Page" });
		expect(result.perRouteHeads[0]?.matchId).toBe("m1");

		vi.unstubAllGlobals();
	});

	it("head message with null d → ignored", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(createMockResponse([line({ d: null, m: "m1", t: "h" }), line({ t: "d" })]));
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchNDJSON({ url: "/api" });
		expect(result.perRouteHeads).toHaveLength(0);

		vi.unstubAllGlobals();
	});

	it("head message with non-object d → ignored", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(createMockResponse([line({ d: "string-not-object", m: "m1", t: "h" }), line({ t: "d" })]));
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchNDJSON({ url: "/api" });
		expect(result.perRouteHeads).toHaveLength(0);

		vi.unstubAllGlobals();
	});
});

/* ── unknown message types ───────────────────────────────────────── */

describe("unknown message types", () => {
	it("unknown type silently ignored", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([line({ d: "data", m: "m1", t: "l" }), line({ t: "unknown-type" }), line({ t: "d" })]),
			);
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchNDJSON({ url: "/api" });
		expect(result.matches).toHaveLength(1);
		expect(result.success).toBe(true);

		vi.unstubAllGlobals();
	});
});

/* ── prefetch mode ───────────────────────────────────────────────── */

describe("prefetch mode edge cases", () => {
	it("prefetch=true does NOT hydrate loader data (keeps raw)", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([line({ d: { __deferred: true, __key: "d0" }, m: "m1", t: "l" }), line({ t: "d" })]),
			);
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchNDJSON({ prefetch: true, url: "/api" });
		/* In prefetch mode, deferred markers are preserved as-is */
		expect(result.matches[0]?.hasDeferredMarkers).toBe(true);
		const data = result.matches[0]?.loaderData as Record<string, unknown>;
		expect(data["__deferred"]).toBe(true);

		vi.unstubAllGlobals();
	});

	it("prefetch mode with preloaderContext preserved", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([line({ d: "data", m: "m1", p: { userId: "123" }, t: "l" }), line({ t: "d" })]),
			);
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchNDJSON({ prefetch: true, url: "/api" });
		expect(result.matches[0]?.preloaderContext).toEqual({ userId: "123" });

		vi.unstubAllGlobals();
	});
});

/* ── ready vs done signal ordering ───────────────────────────────── */

describe("ready vs done signal ordering", () => {
	it("ready signal before done resolves Promise.race", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([line({ d: "data", m: "m1", t: "l" }), line({ t: "r" }), line({ t: "d" })]),
			);
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchNDJSON({ url: "/api" });
		expect(result.success).toBe(true);
		expect(result.matches).toHaveLength(1);

		vi.unstubAllGlobals();
	});

	it("done without ready still resolves (done also calls resolveLoadersReady)", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(createMockResponse([line({ d: "data", m: "m1", t: "l" }), line({ t: "d" })]));
		vi.stubGlobal("fetch", fetchSpy);

		const result = await fetchNDJSON({ url: "/api" });
		expect(result.success).toBe(true);

		vi.unstubAllGlobals();
	});
});
