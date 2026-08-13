import { describe, expect, it, vi } from "vitest"
import { fetchNDJSON } from "../../../src/ndjson-client/index.ts"
import { formatLogMessage } from "../../../src/ndjson-server/index.ts"
import type { ServerLogEntry } from "../../../src/server-context/index.ts"

describe("formatLogMessage", () => {
	it("formats a log entry as NDJSON line", () => {
		const entry: ServerLogEntry = { a: ["hello", 42], l: "log" }
		const line = formatLogMessage(entry)
		const parsed = JSON.parse(line)
		expect(parsed).toEqual({ a: ["hello", 42], l: "log", t: "g" })
	})

	it("formats warn level", () => {
		const entry: ServerLogEntry = { a: ["warning"], l: "warn" }
		const parsed = JSON.parse(formatLogMessage(entry))
		expect(parsed.l).toBe("warn")
		expect(parsed.t).toBe("g")
	})

	it("formats error level", () => {
		const entry: ServerLogEntry = { a: ["error msg"], l: "error" }
		const parsed = JSON.parse(formatLogMessage(entry))
		expect(parsed.l).toBe("error")
		expect(parsed.t).toBe("g")
	})
})

function createMockResponse(lines: string[]): Response {
	const body = `${lines.join("\n")}\n`
	const encoder = new TextEncoder()
	const encoded = encoder.encode(body)

	let read = false
	const reader = {
		cancel: vi.fn(),
		read: vi.fn(() => {
			if (!read) {
				read = true
				return { done: false, value: encoded }
			}
			return { done: true, value: undefined }
		}),
	}

	return {
		body: { getReader: () => reader },
		ok: true,
	} as unknown as Response
}

function line(obj: Record<string, unknown>): string {
	return JSON.stringify(obj)
}

describe("ndjson-client log message handling", () => {
	it("forwards server log to console.log", async () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([
					line({ a: ["hello from server"], l: "log", t: "g" }),
					line({ d: null, m: "test", t: "l" }),
					line({ t: "r" }),
					line({ t: "d" }),
				]),
			)
		vi.stubGlobal("fetch", fetchSpy)

		await fetchNDJSON({ url: "/test" })

		expect(logSpy).toHaveBeenCalledWith(
			"%c[server]",
			"color:#60a5fa;font-weight:bold",
			"hello from server",
		)

		logSpy.mockRestore()
		vi.unstubAllGlobals()
	})

	it("forwards server warn to console.warn", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([
					line({ a: ["watch out"], l: "warn", t: "g" }),
					line({ d: null, m: "test", t: "l" }),
					line({ t: "r" }),
					line({ t: "d" }),
				]),
			)
		vi.stubGlobal("fetch", fetchSpy)

		await fetchNDJSON({ url: "/test" })

		expect(warnSpy).toHaveBeenCalledWith(
			"%c[server]",
			"color:#60a5fa;font-weight:bold",
			"watch out",
		)

		warnSpy.mockRestore()
		vi.unstubAllGlobals()
	})

	it("forwards server error to console.error", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([
					line({ a: ["something broke"], l: "error", t: "g" }),
					line({ d: null, m: "test", t: "l" }),
					line({ t: "r" }),
					line({ t: "d" }),
				]),
			)
		vi.stubGlobal("fetch", fetchSpy)

		await fetchNDJSON({ url: "/test" })

		expect(errorSpy).toHaveBeenCalledWith(
			"%c[server]",
			"color:#60a5fa;font-weight:bold",
			"something broke",
		)

		errorSpy.mockRestore()
		vi.unstubAllGlobals()
	})

	it("forwards multiple args", async () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				createMockResponse([
					line({ a: ["msg", 42, { key: "val" }], l: "log", t: "g" }),
					line({ d: null, m: "test", t: "l" }),
					line({ t: "r" }),
					line({ t: "d" }),
				]),
			)
		vi.stubGlobal("fetch", fetchSpy)

		await fetchNDJSON({ url: "/test" })

		expect(logSpy).toHaveBeenCalledWith("%c[server]", "color:#60a5fa;font-weight:bold", "msg", 42, {
			key: "val",
		})

		logSpy.mockRestore()
		vi.unstubAllGlobals()
	})
})
