import { expect, it } from "vitest";
import { SafariSession, type Fetcher } from "./safari-driver.ts";
import { configOf, runFlows, tunnel, type Flow } from "./verify-safari.ts";

// The defaults: the Mac at `ssh mac`, its driver on 4799, and this machine at its first Tailscale address.
it("config defaults", () => {
	expect(configOf({}, () => "100.1.2.3\nfd7a::1\n")).toEqual({ ssh: "mac", driverPort: 4799, host: "100.1.2.3" });
	const set = { FLARE_SAFARI_SSH: "air", FLARE_SAFARI_DRIVER_PORT: "4800", FLARE_SAFARI_HOST: "10.0.0.2" };
	expect(configOf(set, () => "")).toEqual({ ssh: "air", driverPort: 4800, host: "10.0.0.2" });
});

// With no address the Mac can reach, the run fails before it starts.
it("no address fails", () => {
	expect(() => configOf({}, () => "")).toThrow("set FLARE_SAFARI_HOST");
});

// A Mac that is not reachable fails the run with what to do; it never skips.
it("unreachable fails", async () => {
	const config = { ssh: "flare-no-such-mac.invalid", driverPort: 4799, host: "10.0.0.2" };
	await expect(tunnel(config, fetch)).rejects.toThrow("Run `safaridriver -p 4799` in a Terminal on the Mac");
}, 30_000);

// A WebDriver that opens a session and answers every command with null.
const driver: Fetcher = async (url) => ({
	json: async () => ({
		value: url.endsWith("/session") ? { sessionId: "s1", capabilities: { browserVersion: "17.6" } } : null,
	}),
});

// One failed flow, by its answer or by a throw, fails the run, and every flow still runs and reports.
it("failed flow fails", async () => {
	const safari = await SafariSession.open("http://driver", driver);
	const site = { origin: "http://site", callFn: async () => undefined };
	const flows: Flow[] = [
		{ name: "passes", run: async () => undefined },
		{ name: "answers", run: async () => "stuck" },
		{ name: "throws", run: async () => Promise.reject(new Error("gone")) },
	];
	const lines: string[] = [];
	expect(await runFlows(safari, site, { log: (line) => lines.push(line), flows })).toBe(1);
	expect(lines).toEqual([
		"PASS  passes",
		"FAIL  answers: stuck",
		"FAIL  throws: Error: gone",
		"verify:safari: 1 of 3 flows passed in Safari 17.6",
	]);
	expect(await runFlows(safari, site, { log: () => undefined, flows: [flows[0] as Flow] })).toBe(0);
});
