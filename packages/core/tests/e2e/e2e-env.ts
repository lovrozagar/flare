// The env every e2e boot's server sees: the e2e-only controls' flag and the dashboard's webhook secrets, which its
// routes read from `env` as dx/cache.md's does (BUGS.md 372). The secrets are test values, never a deploy's.
export const E2E_ENV = {
	FLARE_E2E: "1",
	REVALIDATE_SECRET: "e2e-revalidate-secret",
	BILLING_SECRET: "e2e-billing-secret",
}
