/**
 * NDJSON Streaming Unit Tests
 *
 * Tests NDJSON protocol for CSR navigation.
 * Protocol: {"t":"l","m":"matchId","d":{...}}
 */

import { describe, expect, it } from "vitest"
import {
	createNDJSONResponse,
	formatChunkMessage,
	formatDoneMessage,
	formatErrorMessage,
	formatHeadMessage,
	formatLoaderMessage,
	parseNDJSONLine,
} from "../../../src/server/handler/ndjson-nav"

describe("NDJSON messages", () => {
	describe("formatLoaderMessage", () => {
		it("formats loader data message", () => {
			const msg = formatLoaderMessage("_root_/page", { product: "test" })
			const parsed = JSON.parse(msg)
			expect(parsed).toEqual({ d: { product: "test" }, m: "_root_/page", t: "l" })
		})

		it("handles complex data", () => {
			const msg = formatLoaderMessage("_root_/[id]", {
				items: [1, 2, 3],
				nested: { a: "b" },
			})
			const parsed = JSON.parse(msg)
			expect(parsed.t).toBe("l")
			expect(parsed.m).toBe("_root_/[id]")
			expect(parsed.d).toEqual({ items: [1, 2, 3], nested: { a: "b" } })
		})

		it("handles null data", () => {
			const msg = formatLoaderMessage("_root_", null)
			const parsed = JSON.parse(msg)
			expect(parsed.d).toBeNull()
		})
	})

	describe("formatChunkMessage", () => {
		it("formats deferred chunk message", () => {
			const msg = formatChunkMessage("_root_/page", "reviews", [1, 2, 3])
			const parsed = JSON.parse(msg)
			expect(parsed).toEqual({ d: [1, 2, 3], k: "reviews", m: "_root_/page", t: "c" })
		})

		it("includes key for deferred data", () => {
			const parsed = JSON.parse(formatChunkMessage("match1", "activity", { count: 5 }))
			expect(parsed.t).toBe("c")
			expect(parsed.k).toBe("activity")
		})
	})

	describe("formatErrorMessage", () => {
		it("formats error message", () => {
			const msg = formatErrorMessage("_root_/page", new Error("Load failed"))
			const parsed = JSON.parse(msg)
			expect(parsed.t).toBe("e")
			expect(parsed.m).toBe("_root_/page")
			expect(parsed.e.message).toBe("Load failed")
		})

		it("handles error without message", () => {
			const msg = formatErrorMessage("_root_", new Error())
			const parsed = JSON.parse(msg)
			expect(parsed.e.message).toBe("")
		})

		it("includes key when provided", () => {
			const msg = formatErrorMessage("_root_/page", new Error("Failed"), "will-fail")
			const parsed = JSON.parse(msg)
			expect(parsed.t).toBe("e")
			expect(parsed.m).toBe("_root_/page")
			expect(parsed.k).toBe("will-fail")
			expect(parsed.e.message).toBe("Failed")
		})
	})

	describe("formatDoneMessage", () => {
		it("formats done message", () => {
			const msg = formatDoneMessage()
			expect(msg).toBe('{"t":"d"}')
		})
	})

	describe("formatHeadMessage", () => {
		it("formats head config message with title", () => {
			const msg = formatHeadMessage({ title: "My Page" })
			const parsed = JSON.parse(msg)
			expect(parsed).toEqual({ d: { title: "My Page" }, t: "h" })
		})

		it("formats head config with title and description", () => {
			const msg = formatHeadMessage({
				description: "Page description",
				title: "My Page",
			})
			const parsed = JSON.parse(msg)
			expect(parsed.t).toBe("h")
			expect(parsed.d.title).toBe("My Page")
			expect(parsed.d.description).toBe("Page description")
		})

		it("formats head config with all properties", () => {
			const head = {
				canonical: "https://example.com/page",
				description: "Description",
				openGraph: { title: "OG Title", type: "website" },
				title: "Title",
			}
			const parsed = JSON.parse(formatHeadMessage(head))
			expect(parsed.d).toEqual(head)
		})

		it("handles empty head config", () => {
			const msg = formatHeadMessage({})
			const parsed = JSON.parse(msg)
			expect(parsed.t).toBe("h")
			expect(parsed.d).toEqual({})
		})
	})
})

describe("parseNDJSONLine", () => {
	it("parses loader message", () => {
		const msg = parseNDJSONLine('{"t":"l","m":"_root_/page","d":{"foo":"bar"}}')
		expect(msg?.type).toBe("loader")
		if (msg?.type === "loader") {
			expect(msg.matchId).toBe("_root_/page")
			expect(msg.data).toEqual({ foo: "bar" })
		}
	})

	it("parses chunk message", () => {
		const msg = parseNDJSONLine('{"t":"c","m":"_root_","k":"reviews","d":[1,2]}')
		expect(msg?.type).toBe("chunk")
		if (msg?.type === "chunk") {
			expect(msg.matchId).toBe("_root_")
			expect(msg.key).toBe("reviews")
			expect(msg.data).toEqual([1, 2])
		}
	})

	it("parses error message", () => {
		const msg = parseNDJSONLine('{"t":"e","m":"_root_/fail","e":{"message":"Failed"}}')
		expect(msg?.type).toBe("error")
		if (msg?.type === "error") {
			expect(msg.matchId).toBe("_root_/fail")
			expect(msg.error.message).toBe("Failed")
		}
	})

	it("parses error message with key", () => {
		const msg = parseNDJSONLine(
			'{"t":"e","m":"_root_/page","k":"will-fail","e":{"message":"Deferred failed"}}',
		)
		expect(msg?.type).toBe("error")
		if (msg?.type === "error") {
			expect(msg.matchId).toBe("_root_/page")
			expect(msg.key).toBe("will-fail")
			expect(msg.error.message).toBe("Deferred failed")
		}
	})

	it("parses done message", () => {
		const msg = parseNDJSONLine('{"t":"d"}')
		expect(msg?.type).toBe("done")
	})

	it("parses head message", () => {
		const msg = parseNDJSONLine('{"t":"h","d":{"title":"My Page","description":"Desc"}}')
		expect(msg?.type).toBe("head")
		if (msg?.type === "head") {
			expect(msg.head.title).toBe("My Page")
			expect(msg.head.description).toBe("Desc")
		}
	})

	it("parses head message with empty config", () => {
		const msg = parseNDJSONLine('{"t":"h","d":{}}')
		expect(msg?.type).toBe("head")
		if (msg?.type === "head") {
			expect(msg.head).toEqual({})
		}
	})

	it("returns null for invalid JSON", () => {
		const msg = parseNDJSONLine("not json")
		expect(msg).toBeNull()
	})

	it("returns null for unknown type", () => {
		const msg = parseNDJSONLine('{"t":"x"}')
		expect(msg).toBeNull()
	})
})

describe("createNDJSONResponse", () => {
	it("returns Response with correct content type", () => {
		const response = createNDJSONResponse([])
		expect(response.headers.get("Content-Type")).toBe("application/x-ndjson")
	})

	it("streams loader results as NDJSON", async () => {
		const results = [
			{ data: { user: "alice" }, matchId: "_root_", status: "success" as const },
			{ data: { page: 1 }, matchId: "_root_/page", status: "success" as const },
		]

		const response = createNDJSONResponse(results)
		const text = await response.text()
		const lines = text.trim().split("\n")

		expect(lines).toHaveLength(3) /* 2 loaders + done */

		const first = JSON.parse(lines[0] ?? "{}")
		expect(first.t).toBe("l")
		expect(first.m).toBe("_root_")
		expect(first.d).toEqual({ user: "alice" })

		const second = JSON.parse(lines[1] ?? "{}")
		expect(second.t).toBe("l")
		expect(second.m).toBe("_root_/page")

		const last = JSON.parse(lines[2] ?? "{}")
		expect(last.t).toBe("d")
	})

	it("includes error messages for failed loaders", async () => {
		const results = [
			{
				error: new Error("Loader failed"),
				matchId: "_root_/fail",
				status: "error" as const,
			},
		]

		const response = createNDJSONResponse(results)
		const text = await response.text()
		const lines = text.trim().split("\n")

		const errorLine = JSON.parse(lines[0] ?? "{}")
		expect(errorLine.t).toBe("e")
		expect(errorLine.e.message).toBe("Loader failed")
	})

	it("handles mixed success and error results", async () => {
		const results = [
			{ data: { ok: true }, matchId: "_root_", status: "success" as const },
			{ error: new Error("Failed"), matchId: "_root_/fail", status: "error" as const },
			{ data: { page: 1 }, matchId: "_root_/page", status: "success" as const },
		]

		const response = createNDJSONResponse(results)
		const text = await response.text()
		const lines = text.trim().split("\n")

		expect(lines).toHaveLength(4)

		const types = lines.map((line) => JSON.parse(line).t)
		expect(types).toEqual(["l", "e", "l", "d"])
	})

	it("includes head config in response", async () => {
		const results = [{ data: { user: "alice" }, matchId: "_root_", status: "success" as const }]
		const head = { description: "Page description", title: "My Page" }

		const response = createNDJSONResponse(results, head)
		const text = await response.text()
		const lines = text.trim().split("\n")

		expect(lines).toHaveLength(3) /* loader + head + done */

		const types = lines.map((line) => JSON.parse(line).t)
		expect(types).toEqual(["l", "h", "d"])

		const headLine = JSON.parse(lines[1] ?? "{}")
		expect(headLine.d.title).toBe("My Page")
		expect(headLine.d.description).toBe("Page description")
	})

	it("omits head config if empty", async () => {
		const results = [{ data: { user: "alice" }, matchId: "_root_", status: "success" as const }]

		const response = createNDJSONResponse(results, {})
		const text = await response.text()
		const lines = text.trim().split("\n")

		expect(lines).toHaveLength(2) /* loader + done only */

		const types = lines.map((line) => JSON.parse(line).t)
		expect(types).toEqual(["l", "d"])
	})

	it("omits head config if undefined", async () => {
		const results = [{ data: { user: "alice" }, matchId: "_root_", status: "success" as const }]

		const response = createNDJSONResponse(results, undefined)
		const text = await response.text()
		const lines = text.trim().split("\n")

		expect(lines).toHaveLength(2) /* loader + done only */

		const types = lines.map((line) => JSON.parse(line).t)
		expect(types).toEqual(["l", "d"])
	})
})
