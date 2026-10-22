import { expect, it } from "vitest"
import { generator, replayLine, runFrom } from "./seeded.ts"

const take = (next: () => number): number[] => Array.from({ length: 5 }, next)

// The same seed gives the same sequence on every machine, and another seed another one.
it("sequence", () => {
	const first = generator(20_261_017)
	const again = generator(20_261_017)
	const other = generator(7)
	const sequence = take(first)
	expect(take(again)).toEqual(sequence)
	expect(take(other)).not.toEqual(sequence)
	expect(sequence.every((value) => value >= 0 && value < 1)).toBe(true)
})

// A run reads its seed and step count from the env under the suite's names, else the gate's defaults; `long` picks
// the long form's step count and, with no seed set, the night's date as the seed.
it("run from env", () => {
	expect(runFrom({}, { name: "CHAOS", seed: 20_261_017, steps: 40, longSteps: 400 })).toEqual({
		seed: 20_261_017,
		steps: 40,
	})
	expect(
		runFrom({ FLARE_CHAOS_SEED: "42", FLARE_CHAOS_STEPS: "9" }, { name: "CHAOS", seed: 1, steps: 40, longSteps: 400 }),
	).toEqual({ seed: 42, steps: 9 })
	const night = runFrom(
		{ FLARE_BLACKBOX_LONG: "1" },
		{ name: "CHAOS", seed: 1, steps: 40, longSteps: 400 },
		new Date("2026-10-21T03:41:00Z"),
	)
	expect(night).toEqual({ seed: 20_261_021, steps: 400 })
	expect(() => runFrom({ FLARE_CHAOS_SEED: "x" }, { name: "CHAOS", seed: 1, steps: 40, longSteps: 400 })).toThrow(
		"FLARE_CHAOS_SEED is not a whole number: x",
	)
})

// A failure names the seed, the step count, and the command that replays it exactly.
it("replay line", () => {
	expect(
		replayLine(
			{ seed: 42, steps: 9 },
			{ name: "CHAOS", command: "bun run test:e2e -- --project node-prod-chromium docs-chaos" },
		),
	).toBe(
		"seed 42, 9 steps; replay: FLARE_CHAOS_SEED=42 FLARE_CHAOS_STEPS=9 bun run test:e2e -- --project node-prod-chromium docs-chaos",
	)
})
