import { describe, expect, it } from "vitest"
import { getServerLogs, runWithServerContext, serverLog } from "../../../src/server-context/index.ts"

describe("serverLog", () => {
	it("captures log entry in request context", () => {
		runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, () => {
			serverLog("log", "hello", 42)
			const logs = getServerLogs()
			expect(logs).toEqual([{ a: ["hello", 42], l: "log" }])
		})
	})

	it("captures warn and error levels", () => {
		runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, () => {
			serverLog("warn", "watch out")
			serverLog("error", "boom")
			const logs = getServerLogs()
			expect(logs).toHaveLength(2)
			expect(logs[0]).toEqual({ a: ["watch out"], l: "warn" })
			expect(logs[1]).toEqual({ a: ["boom"], l: "error" })
		})
	})

	it("accumulates multiple log calls", () => {
		runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, () => {
			serverLog("log", "first")
			serverLog("log", "second")
			serverLog("log", "third")
			expect(getServerLogs()).toHaveLength(3)
		})
	})

	it("returns empty array when no logs", () => {
		runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, () => {
			expect(getServerLogs()).toEqual([])
		})
	})

	it("returns empty array outside request context", () => {
		expect(getServerLogs()).toEqual([])
	})

	it("isolates logs between concurrent requests", async () => {
		const [logsA, logsB] = await Promise.all([
			runWithServerContext({ nonce: "a", request: new Request("http://localhost/a") }, async () => {
				serverLog("log", "from-a")
				await new Promise((r) => setTimeout(r, 10))
				return getServerLogs()
			}),
			runWithServerContext({ nonce: "b", request: new Request("http://localhost/b") }, async () => {
				serverLog("log", "from-b")
				await new Promise((r) => setTimeout(r, 5))
				return getServerLogs()
			}),
		])
		expect(logsA).toEqual([{ a: ["from-a"], l: "log" }])
		expect(logsB).toEqual([{ a: ["from-b"], l: "log" }])
	})

	it("handles complex args (objects, arrays, null)", () => {
		runWithServerContext({ nonce: "x", request: new Request("http://localhost/") }, () => {
			serverLog("log", { key: "val" }, [1, 2], null)
			const logs = getServerLogs()
			expect(logs[0]?.a).toEqual([{ key: "val" }, [1, 2], null])
		})
	})
})
