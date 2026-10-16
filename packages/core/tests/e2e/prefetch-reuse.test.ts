import { expect, test } from "./crash.ts"
import { measure, reuseServer, topologies, type Method } from "./prefetch-reuse.ts"

// The engines' module cache reuse for a same-origin app under /app, warmed from the site's landing page (plan 17,
// BUGS.md 124). Only this topology is asserted in the grid: Playwright's Chromium launches with cache partitioning off,
// so a subdomain or cross-site reuse it shows proves nothing; those are measured in stock browsers (prefetch-reuse.ts).
// The engine, not Flare, decides these, so a browser change shows up as this test changing. Once per engine.
const EXPECTED: Record<string, Record<Exclude<Method, "none">, string>> = {
	chromium: { prefetch: "reused", fetch: "reused", modulepreload: "reused" },
	firefox: { prefetch: "reused", fetch: "reused", modulepreload: "reused" },
	// WebKit ignores rel=prefetch, downloads a fetch() again for the module, and reuses a modulepreload.
	webkit: { prefetch: "ignored", fetch: "refetched", modulepreload: "reused" },
}

test("same-origin reuse", async ({ browser, browserName, floor }, info) => {
	test.skip(floor || !info.project.name.startsWith("node-prod-"), "once per engine, on node-prod")
	const server = await reuseServer()
	try {
		const [sameOrigin] = topologies({ FLARE_REUSE_SITE: "127.0.0.1" }, server.port)
		if (sameOrigin === undefined) throw new Error("no same-origin topology")
		const trials = await measure(browser, {
			landing: sameOrigin.host,
			topology: sameOrigin,
			count: server.count,
			tag: `${browserName}-${Date.now()}`,
		})
		console.log(
			`[reuse] ${browserName} ${browser.version()} ${JSON.stringify(trials.map((t) => [t.method, t.verdict]))}`,
		)
		expect(Object.fromEntries(trials.map((trial) => [trial.method, trial.verdict])), browserName).toEqual({
			none: "baseline 1",
			...EXPECTED[browserName],
		})
	} finally {
		server.close()
	}
})
