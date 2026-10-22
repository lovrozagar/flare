// The black-box suites' randomness (plan 21 17.1): one seeded generator, the seed and step count each suite reads from
// the env, and the line a failure prints so the run replays exactly. The gate runs a fixed seed; the long form, with no
// seed set, takes the night's date (YYYYMMDD), so a night's run is reproducible from its date alone.

// mulberry32: a small seeded generator, the same sequence for the same seed on every machine, values in [0, 1).
export function generator(seed: number): () => number {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
		mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296
	}
}

export type Run = { seed: number; steps: number }

export type Suite = { name: string; seed: number; steps: number; longSteps: number }

function whole(env: Readonly<Record<string, string | undefined>>, key: string): number | undefined {
	const value = env[key]
	if (value === undefined) return undefined
	if (!/^\d+$/.test(value)) throw new Error(`${key} is not a whole number: ${value}`)
	return Number(value)
}

// A suite's run: `FLARE_<name>_SEED` and `FLARE_<name>_STEPS` when set; else, under `FLARE_BLACKBOX_LONG=1`, the long
// form's steps and the date's seed; else the gate's seed and steps.
export function runFrom(env: Readonly<Record<string, string | undefined>>, suite: Suite, now = new Date()): Run {
	const long = env["FLARE_BLACKBOX_LONG"] === "1"
	const date = Number(now.toISOString().slice(0, 10).replaceAll("-", ""))
	return {
		seed: whole(env, `FLARE_${suite.name}_SEED`) ?? (long ? date : suite.seed),
		steps: whole(env, `FLARE_${suite.name}_STEPS`) ?? (long ? suite.longSteps : suite.steps),
	}
}

// What a failing run prints: its seed, its step count, and the command that replays it.
export function replayLine(run: Run, suite: { name: string; command: string }): string {
	const env = `FLARE_${suite.name}_SEED=${run.seed} FLARE_${suite.name}_STEPS=${run.steps}`
	return `seed ${run.seed}, ${run.steps} steps; replay: ${env} ${suite.command}`
}
