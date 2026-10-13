import { useNavigationProgress } from "@lovrozagar/flare";
import type { JSX } from "@solidjs/web";

// Flare returns the number. The app paints the bar (dx/navigate.md useNavigationProgress).
export function ProgressBar(): JSX.Element {
	const progress = useNavigationProgress({ trickle: 120, minDisplay: 300 });
	return (
		<div
			id="progress"
			class="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 bg-gradient-to-r from-flame-500 to-amber-300 transition-[width,opacity] duration-200"
			data-pending={progress.pending ? "true" : "false"}
			style={{ width: `${(progress.value ?? 0) * 100}%`, opacity: progress.value === null ? "0" : "1" }}
		/>
	);
}
