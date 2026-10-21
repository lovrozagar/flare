import { expect, it } from "vitest"
import { compare, LIMIT, medians, table } from "./bench-compare.ts"

const json = (entries: Record<string, number>) => ({
	files: [
		{
			groups: [
				{
					fullName: "bench/a.bench.ts > group",
					benchmarks: Object.entries(entries).map(([name, median]) => ({ name, median })),
				},
			],
		},
	],
})

// Each bench by its group and name, with its median.
it("medians", () => {
	expect([...medians(json({ fast: 0.001, slow: 0.01 }))]).toEqual([
		["bench/a.bench.ts > group > fast", 0.001],
		["bench/a.bench.ts > group > slow", 0.01],
	])
})

// A bench more than twice its previous median is slow; at twice or under it passes; a new bench has no ratio.
it("compare", () => {
	const before = medians(json({ same: 0.001, double: 0.001, past: 0.001 }))
	const now = medians(json({ same: 0.001, double: 0.002, past: 0.00201, fresh: 0.5 }))
	const rows = compare(now, before)
	expect(rows.map((row) => [row.name.split(" > ").at(-1), row.slow])).toEqual([
		["same", false],
		["double", false],
		["past", true],
		["fresh", false],
	])
	expect(rows.at(-1)?.ratio).toBeUndefined()
	expect(LIMIT).toBe(2)
	expect(compare(medians(json({ zero: 1 })), medians(json({ zero: 0 })))[0]?.ratio).toBeUndefined()
})

// The job summary's table: µs per call, the ratio, and the slow ones marked.
it("table", () => {
	const rows = compare(medians(json({ a: 0.003, b: 0.001 })), medians(json({ a: 0.001 })))
	expect(table(rows)).toBe(
		"| Bench | Previous | Tonight | Ratio |\n| --- | --- | --- | --- |\n" +
			"| bench/a.bench.ts > group > a | 1.000 µs | 3.000 µs | 3.00 **slow** |\n" +
			"| bench/a.bench.ts > group > b | - | 1.000 µs | new |",
	)
})
