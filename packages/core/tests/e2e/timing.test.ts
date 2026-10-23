import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it } from "vitest"
import Timing, { timingTable } from "./timing.ts"

// The table lists each project and spec file's time, the slowest first, in whole seconds to one decimal.
it("timing table", () => {
	const table = timingTable(
		new Map([
			["node-prod-chromium docs-hostile.test.ts", 41_250],
			["node-prod-chromium docs-chaos.test.ts", 3_000],
			["bun-prod-chromium docs-hostile.test.ts", 52_040],
		]),
	)
	expect(table).toBe(
		[
			"### e2e time per spec file",
			"",
			"| project | file | s |",
			"| --- | --- | --- |",
			"| bun-prod-chromium | docs-hostile.test.ts | 52.0 |",
			"| node-prod-chromium | docs-hostile.test.ts | 41.3 |",
			"| node-prod-chromium | docs-chaos.test.ts | 3.0 |",
			"",
		].join("\n"),
	)
})

// A test case as the reporter reads it: its spec file and its project.
function test(project: string, file: string): never {
	return { location: { file: `/repo/tests/e2e/${file}` }, parent: { project: () => ({ name: project }) } } as never
}

// The reporter sums each file's test durations per project and appends the table to the GitHub job summary, where a
// green run's time can be read; with no summary file it writes nothing (plan 34 6.2, BUGS.md 489).
it("reporter writes the summary", () => {
	const dir = mkdtempSync(join(tmpdir(), "flare-timing-"))
	const summary = join(dir, "summary.md")
	const reporter = new Timing({ summary })
	reporter.onTestEnd(test("node-prod-chromium", "docs-parity.test.ts"), { duration: 1_000 } as never)
	reporter.onTestEnd(test("node-prod-chromium", "docs-parity.test.ts"), { duration: 2_500 } as never)
	reporter.onTestEnd(test("bun-prod-chromium", "docs-parity.test.ts"), { duration: 500 } as never)
	reporter.onEnd()
	try {
		expect(readFileSync(summary, "utf8")).toContain("| node-prod-chromium | docs-parity.test.ts | 3.5 |")
		expect(readFileSync(summary, "utf8")).toContain("| bun-prod-chromium | docs-parity.test.ts | 0.5 |")
	} finally {
		rmSync(dir, { recursive: true })
	}
})

// Playwright constructs the reporter with its own options object, which names no summary: the reporter then writes to
// GitHub's summary file from the env, and with none set it writes nothing.
it("reporter from playwright", () => {
	const dir = mkdtempSync(join(tmpdir(), "flare-timing-"))
	const summary = join(dir, "summary.md")
	const before = process.env["GITHUB_STEP_SUMMARY"]
	try {
		process.env["GITHUB_STEP_SUMMARY"] = summary
		const reporter = new Timing({ configDir: "/repo/packages/core/tests/e2e" } as never)
		reporter.onTestEnd(test("node-prod-chromium", "docs-chaos.test.ts"), { duration: 1_500 } as never)
		reporter.onEnd()
		expect(readFileSync(summary, "utf8")).toContain("| node-prod-chromium | docs-chaos.test.ts | 1.5 |")
		delete process.env["GITHUB_STEP_SUMMARY"]
		new Timing().onEnd()
	} finally {
		if (before === undefined) delete process.env["GITHUB_STEP_SUMMARY"]
		else process.env["GITHUB_STEP_SUMMARY"] = before
		rmSync(dir, { recursive: true })
	}
})

// The same table goes to the job log in a folded group: GitHub's API has no endpoint for a step summary, so the log is
// where a script reads a run's times (plan 41 2.1.1, BUGS.md 489).
it("reporter logs the table", () => {
	const dir = mkdtempSync(join(tmpdir(), "flare-timing-"))
	const summary = join(dir, "summary.md")
	const logged: string[] = []
	try {
		const reporter = new Timing({ summary, log: (text) => void logged.push(text) })
		reporter.onTestEnd(test("node-prod-chromium", "docs-hostile.test.ts"), { duration: 2_000 } as never)
		reporter.onEnd()
		expect(logged).toEqual([`::group::e2e time per spec file\n${readFileSync(summary, "utf8")}::endgroup::\n`])
	} finally {
		rmSync(dir, { recursive: true })
	}
})
