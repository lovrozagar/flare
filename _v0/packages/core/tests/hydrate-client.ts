import { hydrate, type JSX } from "@solidjs/web";

/** Run a real client `hydrate()` against `container`, with the minimal `_$HY` bootstrap the SSR script would install. */
export function hydrateClient(code: () => JSX.Element, container: HTMLElement): () => void {
	const g = globalThis as { _$HY?: Record<string, unknown> };
	const prev = g._$HY;
	g._$HY = { completed: new WeakSet(), done: false, events: [], fe() {}, r: {} };
	try {
		return hydrate(code, container);
	} finally {
		g._$HY = prev;
	}
}
