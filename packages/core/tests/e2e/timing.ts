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
	readonly #log: (text: string) => void
	readonly #totals = new Map<string, number>()

	// Playwright constructs a reporter with its options object; `summary` is the file, by default GitHub's, and `log`
	// the job log, by default stdout.
	constructor(options: { summary?: string | undefined; log?: (text: string) => void } = {}) {
		this.#summary = options.summary ?? process.env["GITHUB_STEP_SUMMARY"]
		this.#log = options.log ?? ((text) => void process.stdout.write(text))
	}

	onTestEnd(test: TestCase, result: TestResult): void {
		const key = `${test.parent.project()?.name ?? "no project"} ${basename(test.location.file)}`
		this.#totals.set(key, (this.#totals.get(key) ?? 0) + result.duration)
	}

	// The summary for a person, and the same table in a folded log group for a script: GitHub's API has no endpoint for
	// a step summary (plan 41 2.1.1).
	onEnd(): void {
		if (this.#summary === undefined) return
		const table = timingTable(this.#totals)
		appendFileSync(this.#summary, table)
		this.#log(`::group::e2e time per spec file\n${table}::endgroup::\n`)
	}
}
