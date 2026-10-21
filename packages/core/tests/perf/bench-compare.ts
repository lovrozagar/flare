// The nightly's bench alarm (plan 21 15.6): tonight's `vitest bench --outputJson` against the previous night's on the
// same runner class. A bench whose median time per call is more than twice the previous one's fails the job; the
// table goes to the job summary. There is no budget: a bench's number is only compared to itself.
//
//   node tests/perf/bench-compare.ts <tonight.json> [<previous.json>] [--summary <file>]
//
// With no previous file, the first night records itself and passes.
import { appendFileSync, existsSync, readFileSync } from "node:fs"

type BenchJson = {
	files: { groups: { fullName: string; benchmarks: { name: string; median: number }[] }[] }[]
}

export type Row = { name: string; before: number | undefined; now: number; ratio: number | undefined; slow: boolean }

// The slowdown past which a bench fails: twice the previous median, a regression, not a runner's noise.
export const LIMIT = 2

// Each bench's median milliseconds per call, by its group and name.
export function medians(json: BenchJson): Map<string, number> {
	const found = new Map<string, number>()
	for (const file of json.files) {
		for (const group of file.groups) {
			for (const bench of group.benchmarks) found.set(`${group.fullName} > ${bench.name}`, bench.median)
		}
	}
	return found
}

// Tonight's benches beside the previous night's, in tonight's order. A bench new tonight has nothing to compare to.
export function compare(now: Map<string, number>, before: Map<string, number>): Row[] {
	return [...now].map(([name, value]) => {
		const previous = before.get(name)
		const ratio = previous === undefined || previous === 0 ? undefined : value / previous
		return { name, before: previous, now: value, ratio, slow: ratio !== undefined && ratio > LIMIT }
	})
}

// A median in milliseconds, written in microseconds.
function micro(value: number | undefined): string {
	return value === undefined ? "-" : `${(value * 1000).toFixed(3)} µs`
}

export function table(rows: readonly Row[]): string {
	const lines = ["| Bench | Previous | Tonight | Ratio |", "| --- | --- | --- | --- |"]
	for (const row of rows) {
		const ratio = row.ratio === undefined ? "new" : `${row.ratio.toFixed(2)}${row.slow ? " **slow**" : ""}`
		lines.push(`| ${row.name} | ${micro(row.before)} | ${micro(row.now)} | ${ratio} |`)
	}
	return lines.join("\n")
}

function read(path: string): Map<string, number> {
	return medians(JSON.parse(readFileSync(path, "utf8")) as BenchJson)
}

if (import.meta.main) {
	const args = process.argv.slice(2)
	const summaryAt = args.indexOf("--summary")
	const summary = summaryAt === -1 ? undefined : args[summaryAt + 1]
	const files = summaryAt === -1 ? args : args.filter((_arg, index) => index !== summaryAt && index !== summaryAt + 1)
	const [tonight, previous] = files
	if (tonight === undefined) throw new Error("bench-compare: tonight's JSON is required")
	const rows = compare(read(tonight), previous !== undefined && existsSync(previous) ? read(previous) : new Map())
	const text = table(rows)
	console.log(text)
	if (summary !== undefined) appendFileSync(summary, `${text}\n`)
	const slow = rows.filter((row) => row.slow)
	for (const row of slow) console.error(`slower than ${LIMIT}x: ${row.name} (${row.ratio?.toFixed(2)}x)`)
	process.exit(slow.length > 0 ? 1 : 0)
}
