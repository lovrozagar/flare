import { createEffect, createSignal, onCleanup } from "solid-js";
import { isServer } from "@solidjs/web";
import { useNavigation } from "./pending.ts";

export type ProgressOptions = { trickle?: number; minDisplay?: number };

export type Progress = { readonly pending: boolean; readonly value: number | null };

const START = 0.08;
const CAP = 0.994;

// The creep table of dx/navigate.md: the lower the value, the larger the step. It never reaches 1.
const STEPS: ReadonlyArray<readonly [below: number, add: number]> = [
	[0.2, 0.1],
	[0.5, 0.04],
	[0.8, 0.02],
	[0.994, 0.005],
];

// The hook returns a number. The app paints the bar, and there is no NavigationProgress element.
export function useNavigationProgress(options: ProgressOptions = {}): Progress {
	const trickle = options.trickle ?? 200;
	const minDisplay = options.minDisplay ?? 0;
	if (!Number.isInteger(trickle) || trickle < 16) throw new Error("trickle is an integer of at least 16 ms");
	if (!Number.isInteger(minDisplay) || minDisplay < 0) throw new Error("minDisplay is an integer of at least 0 ms");
	if (isServer) return { pending: false, value: null };
	const navigation = useNavigation();
	const [value, setValue] = createSignal<number | null>(null);
	const timers: {
		creep?: ReturnType<typeof setInterval>;
		hold?: ReturnType<typeof setTimeout>;
		at: number;
		level: number;
	} = { at: 0, level: START };
	const stop = (): void => {
		clearInterval(timers.creep);
		clearTimeout(timers.hold);
	};
	createEffect(
		() => navigation.pending,
		(pending, previous) => {
			if (pending === (previous ?? false)) return;
			stop();
			if (pending) {
				timers.at = Date.now();
				timers.level = START;
				setValue(START);
				timers.creep = setInterval(() => {
					timers.level = creep(timers.level);
					setValue(timers.level);
				}, trickle);
				return;
			}
			// A failed navigation completes the same way a commit does.
			setValue(1);
			timers.hold = setTimeout(() => setValue(null), Math.max(0, timers.at + minDisplay - Date.now()));
		},
	);
	onCleanup(stop);
	return {
		get pending() {
			return navigation.pending;
		},
		get value() {
			return value();
		},
	};
}

// Rounded to thousandths, so float drift cannot leave the value just short of the cap.
function creep(current: number): number {
	const step = STEPS.find(([below]) => current < below);
	return step === undefined ? current : Math.min(CAP, Math.round((current + step[1]) * 1000) / 1000);
}
