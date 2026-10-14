import { browserEndpoint } from "../../../../scripts/browser-server.ts";

// Once per run, in the runner, before any worker starts: the browsers' endpoint goes in the env the workers inherit,
// and playwright.config.ts, which each worker loads again, connects every project to it (B97).
export default async function globalSetup(): Promise<void> {
	const endpoint = await browserEndpoint();
	if (endpoint !== undefined) process.env["FLARE_BROWSER_WS"] = endpoint;
}
