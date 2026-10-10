/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { getServerLogs, runWithServerContext, serverLog } from "../../../src/server-context/index.ts";

describe("Bug 51: server logs cap per request", () => {
	it("should cap log entries to prevent unbounded accumulation", async () => {
		await runWithServerContext({ nonce: "test", request: new Request("http://localhost") }, async () => {
			/* Simulate a loop that logs 20,000 entries */
			for (let i = 0; i < 20_000; i++) {
				serverLog("log", `entry ${i}`);
			}

			const logs = getServerLogs();
			/* Should be capped at a reasonable limit (e.g., 1000) */
			expect(logs.length).toBeLessThanOrEqual(1000);
		});
	});

	it("should still accumulate logs under the cap", async () => {
		await runWithServerContext({ nonce: "test", request: new Request("http://localhost") }, async () => {
			serverLog("log", "first");
			serverLog("warn", "second");
			serverLog("error", "third");

			const logs = getServerLogs();
			expect(logs.length).toBe(3);
		});
	});
});
