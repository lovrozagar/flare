import { describe, expect, it } from "vitest"
import { createDeferContext } from "../../../src/defer/index.ts"
import type { PipelineMatch } from "../../../src/loader-pipeline/index.ts"
import {
	createNDJSONResponse,
	createStreamingNDJSONResponse,
	formatChunkMessage,
	formatErrorMessage,
	formatLoaderMessage,
	formatRedirectMessage,
	serializeLoaderData,
} from "../../../src/ndjson-server/index.ts"

function makeMatch(overrides?: Partial<PipelineMatch>): PipelineMatch {
	return {
		deferContext: createDeferContext("m1"),
		loaderData: undefined,
		matchId: "m1",
		preloaderContext: {},
		route: { _type: "render", variablePath: "/", virtualPath: "_root_" },
		status: "success",
		...overrides,
	}
}

function parseLines(body: string): unknown[] {
	return body
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line))
}

/* ── 2.1 Streaming abort/cancellation ─────────────────────────────────── */

describe("streaming abort/cancellation", () => {
	it("empty deferred contexts → only loader + ready + done messages", async () => {
		const match = makeMatch({ loaderData: "x", matchId: "r1" })
		const resp = createStreamingNDJSONResponse({
			deferContexts: new Map(),
			matches: [match],
		})
		const msgs = parseLines(await resp.text())
		const types = msgs.map((m) => (m as Record<string, unknown>).t)
		expect(types).toEqual(["l", "r", "d"])
	})

	it("single deferred that rejects → error chunk + done", async () => {
		const ctx = createDeferContext("r1")
		ctx.defer(() => Promise.reject(new Error("deferred-fail")), { key: "d0" })
		const match = makeMatch({ deferContext: ctx, loaderData: "x", matchId: "r1" })
		const resp = createStreamingNDJSONResponse({
			deferContexts: new Map([["r1", ctx]]),
			matches: [match],
		})
		const msgs = parseLines(await resp.text())
		const errors = msgs.filter((m) => (m as Record<string, unknown>).t === "e")
		expect(errors).toHaveLength(1)
		expect((errors[0] as Record<string, Record<string, unknown>>).e.message).toBe("deferred-fail")
		/* done must be the last message */
		expect((msgs[msgs.length - 1] as Record<string, unknown>).t).toBe("d")
	})

	it("multiple deferred, one rejects → mixed chunk + error", async () => {
		const ctx = createDeferContext("r1")
		ctx.defer(() => Promise.resolve("ok-data"), { key: "d0" })
		ctx.defer(() => Promise.reject(new Error("bad")), { key: "d1" })
		const match = makeMatch({ deferContext: ctx, loaderData: "x", matchId: "r1" })
		const resp = createStreamingNDJSONResponse({
			deferContexts: new Map([["r1", ctx]]),
			matches: [match],
		})
		const msgs = parseLines(await resp.text())
		const chunks = msgs.filter((m) => (m as Record<string, unknown>).t === "c")
		const errors = msgs.filter((m) => (m as Record<string, unknown>).t === "e")
		expect(chunks).toHaveLength(1)
		expect(errors).toHaveLength(1)
		expect((msgs[msgs.length - 1] as Record<string, unknown>).t).toBe("d")
	})

	it("three deferred all resolve → all chunk messages emitted", async () => {
		const ctx = createDeferContext("r1")
		ctx.defer(() => Promise.resolve("a"), { key: "d0" })
		ctx.defer(() => Promise.resolve("b"), { key: "d1" })
		ctx.defer(() => Promise.resolve("c"), { key: "d2" })
		const match = makeMatch({ deferContext: ctx, loaderData: "x", matchId: "r1" })
		const resp = createStreamingNDJSONResponse({
			deferContexts: new Map([["r1", ctx]]),
			matches: [match],
		})
		const msgs = parseLines(await resp.text())
		const chunks = msgs.filter((m) => (m as Record<string, unknown>).t === "c")
		expect(chunks).toHaveLength(3)
	})
})

/* ── 2.2 Serialization edge cases ─────────────────────────────────────── */

describe("serialization edge cases", () => {
	it("deeply nested Deferred (3+ levels)", () => {
		const data = {
			l1: {
				l2: {
					l3: { __deferred: true, key: "deep", promise: Promise.resolve(1) },
				},
			},
		}
		const result = serializeLoaderData(data) as Record<
			string,
			Record<string, Record<string, Record<string, unknown>>>
		>
		expect(result.l1.l2.l3.__deferred).toBe(true)
		expect(result.l1.l2.l3.key).toBe("deep")
		expect(result.l1.l2.l3.promise).toBeUndefined()
	})

	it("data containing functions → stripped by JSON.stringify in formatLoaderMessage", () => {
		const match = makeMatch({
			loaderData: { fn: () => "nope", value: 42 },
			matchId: "r1",
		})
		const msg = formatLoaderMessage(match)
		const parsed = JSON.parse(msg) as Record<string, Record<string, unknown>>
		expect(parsed.d.value).toBe(42)
		expect(parsed.d.fn).toBeUndefined()
	})

	it("data with toJSON() method → respected by serialization", () => {
		const custom = {
			secret: "hidden",
			toJSON() {
				return { exposed: true }
			},
		}
		const match = makeMatch({ loaderData: custom, matchId: "r1" })
		const msg = formatLoaderMessage(match)
		const parsed = JSON.parse(msg) as Record<string, Record<string, unknown>>
		expect(parsed.d.exposed).toBe(true)
		expect(parsed.d.secret).toBeUndefined()
	})

	it("undefined values in objects → stripped by JSON.stringify", () => {
		const match = makeMatch({
			loaderData: { a: undefined, b: "keep" },
			matchId: "r1",
		})
		const msg = formatLoaderMessage(match)
		const parsed = JSON.parse(msg) as Record<string, Record<string, unknown>>
		expect(parsed.d.b).toBe("keep")
		expect("a" in (parsed.d as object)).toBe(false)
	})

	it("NaN/Infinity → null in JSON output", () => {
		const match = makeMatch({
			loaderData: { inf: Infinity, nan: NaN, negInf: -Infinity },
			matchId: "r1",
		})
		const msg = formatLoaderMessage(match)
		const parsed = JSON.parse(msg) as Record<string, Record<string, unknown>>
		expect(parsed.d.nan).toBeNull()
		expect(parsed.d.inf).toBeNull()
		expect(parsed.d.negInf).toBeNull()
	})

	it("diamond reference preserved (shared objects appear twice)", () => {
		const shared = { id: 1, name: "shared" }
		const data = { a: shared, b: shared }
		const result = serializeLoaderData(data) as Record<string, Record<string, unknown>>
		expect(result.a.id).toBe(1)
		expect(result.b.id).toBe(1)
		expect(result.b).not.toBeNull()
	})
})

/* ── 2.3 Protocol robustness ─────────────────────────────────────────── */

describe("protocol robustness", () => {
	it("redirect with external + replace combined", () => {
		const msg = formatRedirectMessage("https://example.com", 301, true, true)
		const parsed = JSON.parse(msg) as Record<string, unknown>
		expect(parsed.u).toBe("https://example.com")
		expect(parsed.s).toBe(301)
		expect(parsed.r).toBe(true)
		expect(parsed.xl).toBe(true)
	})

	it("error message with Unicode characters", () => {
		const err = new Error("Fehler: ungültige Eingabe 日本語")
		const msg = formatErrorMessage("r1", err)
		const parsed = JSON.parse(msg) as Record<string, Record<string, unknown>>
		expect(parsed.e.message).toBe("Fehler: ungültige Eingabe 日本語")
	})

	it("formatLoaderMessage with null preloaderContext → omitted", () => {
		const match = makeMatch({
			loaderData: "data",
			matchId: "r1",
			preloaderContext: undefined,
		})
		const parsed = JSON.parse(formatLoaderMessage(match)) as Record<string, unknown>
		expect(parsed.p).toBeUndefined()
	})

	it("formatErrorMessage with custom Error.name preserved", () => {
		const err = new Error("validation failed")
		err.name = "ValidationError"
		const parsed = JSON.parse(formatErrorMessage("r1", err)) as Record<
			string,
			Record<string, unknown>
		>
		expect(parsed.e.name).toBe("ValidationError")
		expect(parsed.e.message).toBe("validation failed")
	})

	it("formatChunkMessage serializes complex nested data", () => {
		const data = { items: [{ id: 1 }, { id: 2 }], total: 2 }
		const msg = formatChunkMessage("r1", "k1", data)
		const parsed = JSON.parse(msg) as Record<string, unknown>
		expect(parsed.d).toEqual(data)
		expect(parsed.m).toBe("r1")
		expect(parsed.k).toBe("k1")
	})
})

/* ── 2.4 Response builder edge cases ─────────────────────────────────── */

describe("response builder edge cases", () => {
	it("createNDJSONResponse with 0 matches → headers still correct", async () => {
		const resp = createNDJSONResponse({ deferContexts: new Map(), matches: [] })
		expect(resp.headers.get("Content-Type")).toBe("application/x-ndjson")
		expect(resp.headers.get("Cache-Control")).toBe("no-store")
		expect(resp.status).toBe(200)
		const msgs = parseLines(await resp.text())
		expect(msgs).toHaveLength(2)
		expect((msgs[0] as Record<string, unknown>).t).toBe("r")
		expect((msgs[1] as Record<string, unknown>).t).toBe("d")
	})

	it("streaming response with only CSS deferred (no JS chunks)", async () => {
		const ctx = createDeferContext("r1")
		ctx.defer(() => Promise.resolve("css-resolved"), { key: "css0" })
		const match = makeMatch({ deferContext: ctx, loaderData: "x", matchId: "r1" })
		const resp = createStreamingNDJSONResponse({
			deferContexts: new Map([["r1", ctx]]),
			matches: [match],
		})
		const msgs = parseLines(await resp.text())
		const chunks = msgs.filter((m) => (m as Record<string, unknown>).t === "c")
		expect(chunks).toHaveLength(1)
		expect((chunks[0] as Record<string, unknown>).k).toBe("css0")
	})

	it("non-streaming with errors in some routes + success in others", async () => {
		const m1 = makeMatch({ error: new Error("e1"), matchId: "r1", status: "error" })
		const m2 = makeMatch({ loaderData: "ok", matchId: "r2", status: "success" })
		const resp = createNDJSONResponse({ deferContexts: new Map(), matches: [m1, m2] })
		const msgs = parseLines(await resp.text())
		const errors = msgs.filter((m) => (m as Record<string, unknown>).t === "e")
		const loaders = msgs.filter((m) => (m as Record<string, unknown>).t === "l")
		expect(errors).toHaveLength(1)
		expect(loaders).toHaveLength(1)
	})

	it("streaming response Content-Type is ndjson", async () => {
		const resp = createStreamingNDJSONResponse({ deferContexts: new Map(), matches: [] })
		expect(resp.headers.get("Content-Type")).toBe("application/x-ndjson")
		expect(resp.headers.get("Cache-Control")).toBe("no-store")
	})

	it("streaming with head configs + deferred → correct ordering", async () => {
		const ctx = createDeferContext("r1")
		ctx.defer(() => Promise.resolve("deferred-val"), { key: "d0" })
		const match = makeMatch({
			deferContext: ctx,
			headConfig: { title: "Test" },
			loaderData: "x",
			matchId: "r1",
		})
		const resp = createStreamingNDJSONResponse({
			deferContexts: new Map([["r1", ctx]]),
			matches: [match],
		})
		const msgs = parseLines(await resp.text())
		const types = msgs.map((m) => (m as Record<string, unknown>).t)
		/* loader, head, ready, chunk, done */
		expect(types[0]).toBe("l")
		expect(types[1]).toBe("h")
		expect(types[2]).toBe("r")
		expect(types.includes("c")).toBe(true)
		expect(types[types.length - 1]).toBe("d")
	})
})
