// The env every e2e boot's server sees: the e2e-only controls' flag and the dashboard's webhook secrets, which its
// routes read from `env` as dx/cache.md's does (BUGS.md 372). The secrets are test values, never a deploy's.
export const E2E_ENV = {
	FLARE_E2E: "1",
	REVALIDATE_SECRET: "e2e-revalidate-secret",
	BILLING_SECRET: "e2e-billing-secret",
}

// FLARE_E2E_TRACE=1, as CI sets it for the e2e jobs: a dev boot's vite.config loads trace.ts from this URL, and its
// server logs each request's lifecycle (BUGS.md 453). Unset, the boot names nothing and the app loads no trace.
export function traceEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
	if (env["FLARE_E2E_TRACE"] !== "1") return {}
	return { FLARE_E2E_TRACE_PLUGIN: new URL("./trace.ts", import.meta.url).href }
}

// FLARE_E2E_WEBKIT_NO_COOP=1, which playwright.config.ts sets for its runs: each boot's server then answers a WebKit
// request without Cross-Origin-Opener-Policy, whose process swap hangs about 1 in 1250 concurrent navigations in
// Playwright's WebKit (bugs.webkit.org 325840, BUGS.md 504.12). verify:safari leaves it unset, so real Safari keeps
// flare's default (webkit-coop.test).
export const WEBKIT_NO_COOP = "FLARE_E2E_WEBKIT_NO_COOP"

export function webkitCoopEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
	return env[WEBKIT_NO_COOP] === "1" ? { [WEBKIT_NO_COOP]: "1" } : {}
}
