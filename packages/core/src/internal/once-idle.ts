const EVENTS = ["mousemove", "touchstart", "scroll", "keydown"] as const;

export function onceIdle(fn: () => void): void {
	let fired = false;

	const run = () => {
		if (fired) return;
		fired = true;
		cleanup();
		fn();
	};

	const cleanup = () => {
		for (const e of EVENTS) removeEventListener(e, run, { capture: true });
	};

	for (const e of EVENTS) {
		addEventListener(e, run, { capture: true, once: true, passive: true });
	}

	if (typeof requestIdleCallback === "function") {
		requestIdleCallback(run);
	}
}
