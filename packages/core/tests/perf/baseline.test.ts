import { expect, it } from "vitest"
import { overBudget, type Budgets } from "./baseline.ts"

const budgets: Budgets = { bytes: { "html raw": 100 }, ratio: { "cpu home us": 1.5 }, absolute: { "cls max": 0.01 } }

// v1 within every budget: no line. Past a byte count, a ratio to v0.9.23 in the same run, or an absolute value: one
// line each, naming the metric, the value, and the budget. A metric the run did not measure fails too.
it("over budget", () => {
	const within = { v0: { "cpu home us": 200 }, v1: { "html raw": 100, "cpu home us": 300, "cls max": 0.009 } }
	expect(overBudget(within, budgets)).toEqual([])
	const past = { v0: { "cpu home us": 200 }, v1: { "html raw": 101, "cpu home us": 301, "cls max": 0.02 } }
	expect(overBudget(past, budgets)).toEqual([
		"html raw: 101 B, budget 100 B",
		"cpu home us: v1 / v0 1.505, budget 1.5",
		"cls max: 0.02, budget 0.01",
	])
	expect(overBudget({ v0: {}, v1: {} }, budgets)).toEqual([
		"html raw: not measured",
		"cpu home us: not measured",
		"cpu home us: not measured",
		"cls max: not measured",
	])
})
