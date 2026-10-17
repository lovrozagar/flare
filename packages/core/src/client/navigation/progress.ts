import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { useNavigation } from "./pending.ts"

export type ProgressOptions = { trickle?: number; minDisplay?: number }

export type Progress = { readonly pending: boolean; readonly value: number | null }

const START = 0.08
const CAP = 0.994

// The creep table of dx/navigate.md: the lower the value, the larger the step. It never reaches 1.
const STEPS: ReadonlyArray<readonly [below: number, add: number]> = [
	[0.2, 0.1],
	[0.5, 0.04],
	[0.8, 0.02],
	[0.994, 0.005],
]

// A timer delay above this fires at once in every browser (BUGS.md 323).
const TIMER_MAX = 2 ** 31 - 1

function within(value: number, least: number): boolean {
	return Number.isInteger(value) && value >= least && value <= TIMER_MAX
}

// The hook returns a number. The app paints the bar, and there is no NavigationProgress element.
export function useNavigationProgress(options: ProgressOptions = {}): Progress {
	const trickle = options.trickle ?? 200
	const minDisplay = options.minDisplay ?? 0
	if (!within(trickle, 16)) throw new Error(`trickle is an integer from 16 to ${TIMER_MAX} ms`)
	if (!within(minDisplay, 0)) throw new Error(`minDisplay is an integer from 0 to ${TIMER_MAX} ms`)
	// The server creates the same owners as the client, so every later sibling keeps its hydration key (BUGS.md B2). Its
	// navigation never pends, so the effect starts no timer there.
	const navigation = useNavigation()
	// `value` is derived in the same flush as `pending`, so no frame pairs a new flag with an old value (BUGS.md B39).
	// While pending it is the creep `level`, which each completion resets to the start ahead of the next navigation.
	// Once pending falls it is 1 until the hold ends and `idle` turns true.
	const [level, setLevel] = createSignal(START)
	const [idle, setIdle] = createSignal(true)
	const value = createMemo<number | null>(() => {
		if (navigation.pending) return level()
		return idle() ? null : 1
	})
	const timers: {
		creep?: ReturnType<typeof setInterval>
		hold?: ReturnType<typeof setTimeout>
		at: number
		level: number
	} = { at: 0, level: START }
	const stop = (): void => {
		clearInterval(timers.creep)
		clearTimeout(timers.hold)
	}
	createEffect(
		() => navigation.pending,
		(pending, previous) => {
			if (pending === (previous ?? false)) return
			stop()
			if (pending) {
				timers.at = Date.now()
				timers.level = START
				setIdle(false)
				timers.creep = setInterval(() => {
					timers.level = creep(timers.level)
					setLevel(timers.level)
				}, trickle)
				return
			}
			// A failed navigation completes the same way a commit does.
			setLevel(START)
			timers.hold = setTimeout(() => setIdle(true), Math.max(0, timers.at + minDisplay - Date.now()))
		},
	)
	onCleanup(stop)
	return {
		get pending() {
			return navigation.pending
		},
		get value() {
			return value()
		},
	}
}

// Rounded to thousandths, so float drift cannot leave the value just short of the cap.
function creep(current: number): number {
	const step = STEPS.find(([below]) => current < below)
	return step === undefined ? current : Math.min(CAP, Math.round((current + step[1]) * 1000) / 1000)
}
