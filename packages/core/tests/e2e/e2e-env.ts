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
