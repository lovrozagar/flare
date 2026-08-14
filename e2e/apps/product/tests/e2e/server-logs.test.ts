import { expect, test } from "@playwright/test"
import { loadPage, navigateSPA } from "./helpers"

test.describe("@prod-only server log forwarding disabled in prod", () => {
	test("SSR: FlareState has no server logs field", async ({ request }) => {
		const response = await request.get("/server-log-test")
		const html = await response.text()
		const match = html.match(/self\.flare=([^<]+)/)
		expect(match).toBeTruthy()
		expect(match?.[1]).not.toContain('"g"')
	})

	test("NDJSON: no log messages in data response", async ({ request }) => {
		const response = await request.get("/server-log-test", {
			headers: { "x-d": "1" },
		})
		const text = await response.text()
		const lines = text.trim().split("\n")
		const logMessages = lines.filter((l) => {
			const parsed = JSON.parse(l) as { t: string }
			return parsed.t === "g"
		})
		expect(logMessages).toHaveLength(0)
	})
})

test.describe("@dev-only server log forwarding", () => {
	test("SSR: forwards server logs to browser console", async ({ page }) => {
		const logs: Array<{ text: string; type: string }> = []

		page.on("console", (msg) => {
			logs.push({ text: msg.text(), type: msg.type() })
		})

		await loadPage(page, "/server-log-test")

		const status = await page.getByTestId("status").textContent()
		expect(status).toBe("ok")

		const serverLogs = logs.filter((l) => l.text.includes("[server]"))
		expect(serverLogs.length).toBeGreaterThanOrEqual(3)

		const logMsg = serverLogs.find((l) => l.type === "log" && l.text.includes("hello from loader"))
		expect(logMsg).toBeTruthy()

		const warnMsg = serverLogs.find(
			(l) => l.type === "warning" && l.text.includes("loader warning"),
		)
		expect(warnMsg).toBeTruthy()

		const errorMsg = serverLogs.find((l) => l.type === "error" && l.text.includes("loader error"))
		expect(errorMsg).toBeTruthy()
	})

	test("CSR navigation: forwards server logs via NDJSON", async ({ page }) => {
		await loadPage(page, "/")

		const logs: Array<{ text: string; type: string }> = []
		page.on("console", (msg) => {
			logs.push({ text: msg.text(), type: msg.type() })
		})

		await navigateSPA(page, "/server-log-test")

		const status = await page.getByTestId("status").textContent()
		expect(status).toBe("ok")

		const serverLogs = logs.filter((l) => l.text.includes("[server]"))
		expect(serverLogs.length).toBeGreaterThanOrEqual(3)

		const logMsg = serverLogs.find((l) => l.type === "log" && l.text.includes("hello from loader"))
		expect(logMsg).toBeTruthy()

		const warnMsg = serverLogs.find(
			(l) => l.type === "warning" && l.text.includes("loader warning"),
		)
		expect(warnMsg).toBeTruthy()

		const errorMsg = serverLogs.find((l) => l.type === "error" && l.text.includes("loader error"))
		expect(errorMsg).toBeTruthy()
	})
})
