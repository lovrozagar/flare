import type { FullConfig } from "@playwright/test"
import { workerStates } from "./host-state.ts"

// Once per run, in the runner, after every worker ended: each worker's host state at its end goes to the job log as one
// group, so a green CI run shows the levels its runner normally ends at, the baseline a failed case's host-state.txt is
// read against (host-state.ts, BUGS.md 504.9). Only on GitHub: a local run keeps the files in test-results.
export default async function globalTeardown(config: FullConfig): Promise<void> {
	if (process.env["GITHUB_ACTIONS"] !== "true") return
	process.stdout.write(await workerStates(config.projects.map((project) => project.outputDir)))
}
