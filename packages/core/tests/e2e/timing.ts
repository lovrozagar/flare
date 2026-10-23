import { appendFileSync } from "node:fs"
import { basename } from "node:path"
import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter"

// Each spec file's time on each project, the sum of its tests' durations (a test's hooks included), as a Markdown
// table, the slowest first.
export function timingTable(totals: ReadonlyMap<string, number>): string {
	const rows = [...totals].sort(([, a], [, b]) => b - a)
	const lines = rows.map(([key, ms]) => {
		const [project, file] = key.split(" ")
		return `| ${project} | ${file} | ${(ms / 1000).toFixed(1)} |`
	})
	return ["### e2e time per spec file", "", "| project | file | s |", "| --- | --- | --- |", ...lines, ""].join("\n")
}

// The GitHub job summary's per-file times, so a green CI run shows what each spec costs: the dot reporter prints only
// the total, and a green run uploads no artifacts (plan 34 6.2, BUGS.md 489). The config adds it only where the summary
// file exists, so a local run reports as before.
export default class Timing implements Reporter {
	readonly #summary: string | undefined
	readonly #totals = new Map<string, number>()

	// Playwright constructs a reporter with its options object; `summary` is the file, by default GitHub's.
	constructor(options: { summary?: string | undefined } = {}) {
		this.#summary = options.summary ?? process.env["GITHUB_STEP_SUMMARY"]
	}

	onTestEnd(test: TestCase, result: TestResult): void {
		const key = `${test.parent.project()?.name ?? "no project"} ${basename(test.location.file)}`
		this.#totals.set(key, (this.#totals.get(key) ?? 0) + result.duration)
	}

	onEnd(): void {
		if (this.#summary !== undefined) appendFileSync(this.#summary, timingTable(this.#totals))
	}
}
