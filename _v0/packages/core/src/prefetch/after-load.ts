/** Run `fn` once the page has loaded and the browser is idle, off the LCP path. Returns a cancel. */
export function scheduleAfterLoad(fn: () => void): () => void {
	let cancelled = false;
	let idleId: number | undefined;
	let timeoutId: ReturnType<typeof setTimeout> | undefined;

	const run = () => {
		if (!cancelled) fn();
	};

	const armIdle = () => {
		if (cancelled) return;
		if (typeof requestIdleCallback === "function") {
			idleId = requestIdleCallback(run);
		} else {
			timeoutId = setTimeout(run, 0);
		}
	};

	if (typeof document !== "undefined" && document.readyState === "complete") {
		armIdle();
	} else if (typeof window !== "undefined") {
		addEventListener("load", armIdle, { once: true });
	} else {
		armIdle();
	}

	return () => {
		cancelled = true;
		if (typeof window !== "undefined") removeEventListener("load", armIdle);
		if (idleId !== undefined && typeof cancelIdleCallback === "function") {
			cancelIdleCallback(idleId);
		}
		if (timeoutId !== undefined) clearTimeout(timeoutId);
	};
}
