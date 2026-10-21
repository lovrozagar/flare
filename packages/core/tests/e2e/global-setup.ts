import { browserEndpoint } from "../../../../scripts/browser-server.ts"

// Once per run, in the runner, before any worker starts: the browsers' endpoints go in the env the workers inherit,
// and playwright.config.ts, which each worker loads again, connects every project to its engine's (B97): Chromium's
// own, with the headers that route it through the loopback proxy (BUGS.md 484), and the shared one for the others.
export default async function globalSetup(): Promise<void> {
	const endpoints = await browserEndpoint()
	if (endpoints === undefined) return
	process.env["FLARE_BROWSER_WS"] = endpoints.endpoint
	process.env["FLARE_CHROMIUM_WS"] = endpoints.chromium.endpoint
	process.env["FLARE_CHROMIUM_HEADERS"] = JSON.stringify(endpoints.chromium.headers)
}
