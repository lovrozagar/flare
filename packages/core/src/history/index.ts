export interface HistoryState {
	historyIndex: number;
	key: string;
	params: Record<string, string | string[]>;
	pathname: string;
	scroll?: ScrollPosition;
	search: string;
	state?: unknown;
}

export interface ScrollPosition {
	x: number;
	y: number;
}

export interface HistoryNavigateEvent {
	historyIndex: number;
	key: string;
	params: Record<string, string | string[]>;
	pathname: string;
	scroll?: ScrollPosition;
	search: string;
	state?: unknown;
	type: "popstate";
}

export interface ScrollStore {
	get(key: string): ScrollPosition | null;
	save(key: string, position: ScrollPosition): void;
}

let keyCounter = 0;

function generateKey(): string {
	keyCounter = (keyCounter + 1) % Number.MAX_SAFE_INTEGER;
	return `${Date.now().toString(36)}-${keyCounter.toString(36)}`;
}

export function createHistoryState(
	pathname: string,
	params: Record<string, string | string[]> = {},
	search = "",
	options?: { hash?: string; historyIndex?: number; state?: unknown },
): HistoryState {
	return {
		historyIndex: options?.historyIndex ?? 0,
		key: generateKey(),
		params,
		pathname,
		search,
		state: options?.state,
	};
}

export function pushHistoryState(
	pathname: string,
	params: Record<string, string | string[]> = {},
	search = "",
	options?: { hash?: string; historyIndex?: number; state?: unknown },
): HistoryState {
	const state = createHistoryState(pathname, params, search, options);
	const url = `${pathname}${search}${options?.hash ?? ""}`;
	if (typeof history !== "undefined" && history) {
		history.pushState(state, "", url);
	}
	return state;
}

export function replaceHistoryState(
	pathname: string,
	params: Record<string, string | string[]> = {},
	search = "",
	options?: { hash?: string; historyIndex?: number; state?: unknown },
): HistoryState {
	const state = createHistoryState(pathname, params, search, options);
	const url = `${pathname}${search}${options?.hash ?? ""}`;
	if (typeof history !== "undefined" && history) {
		history.replaceState(state, "", url);
	}
	return state;
}

function isScrollPosition(raw: unknown): raw is ScrollPosition {
	if (typeof raw !== "object" || raw === null) return false;
	const obj = raw as Record<string, unknown>;
	return typeof obj.x === "number" && typeof obj.y === "number" && Number.isFinite(obj.x) && Number.isFinite(obj.y);
}

export function parseHistoryState(raw: unknown): HistoryState | null {
	if (raw === null || raw === undefined || typeof raw !== "object") return null;
	if (Array.isArray(raw)) return null;

	const obj = raw as Record<string, unknown>;
	if (typeof obj.pathname !== "string") return null;
	if (typeof obj.key !== "string") return null;

	return {
		historyIndex: typeof obj.historyIndex === "number" ? obj.historyIndex : 0,
		key: obj.key,
		params: (typeof obj.params === "object" && obj.params !== null ? obj.params : {}) as Record<
			string,
			string | string[]
		>,
		pathname: obj.pathname,
		scroll: isScrollPosition(obj.scroll) ? obj.scroll : undefined,
		search: typeof obj.search === "string" ? obj.search : "",
		state: obj.state,
	};
}

export function createHistoryListener(onNavigate: (event: HistoryNavigateEvent) => void): () => void {
	if (typeof addEventListener !== "function") {
		return () => {};
	}

	const handler = (event: { state?: unknown }) => {
		const parsed = parseHistoryState(event.state);
		if (!parsed) return;
		onNavigate({
			historyIndex: parsed.historyIndex,
			key: parsed.key,
			params: parsed.params,
			pathname: parsed.pathname,
			scroll: parsed.scroll,
			search: parsed.search,
			state: parsed.state,
			type: "popstate",
		});
	};

	addEventListener("popstate", handler as EventListener);
	return () => removeEventListener("popstate", handler as EventListener);
}

const DEFAULT_SCROLL_TTL = 30 * 60 * 1000;

export function createScrollStore(maxSize = 200, ttl = DEFAULT_SCROLL_TTL): ScrollStore {
	const store = new Map<string, ScrollPosition>();
	const timestamps = new Map<string, number>();

	function evictStale(): void {
		const now = Date.now();
		for (const [key, ts] of timestamps) {
			if (now - ts > ttl) {
				store.delete(key);
				timestamps.delete(key);
			}
		}
	}

	return {
		get(key: string): ScrollPosition | null {
			const ts = timestamps.get(key);
			if (ts !== undefined && Date.now() - ts > ttl) {
				store.delete(key);
				timestamps.delete(key);
				return null;
			}
			return store.get(key) ?? null;
		},

		save(key: string, position: ScrollPosition): void {
			evictStale();
			if (store.has(key)) {
				store.delete(key);
				timestamps.delete(key);
			}
			store.set(key, position);
			timestamps.set(key, Date.now());
			if (store.size > maxSize) {
				const firstKey = store.keys().next().value;
				if (firstKey !== undefined) {
					store.delete(firstKey);
					timestamps.delete(firstKey);
				}
			}
		},
	};
}

export function getCurrentScroll(): ScrollPosition {
	return {
		x: typeof scrollX === "number" ? scrollX : 0,
		y: typeof scrollY === "number" ? scrollY : 0,
	};
}

export function restoreScroll(position: ScrollPosition, behavior?: ScrollBehavior): void {
	if (typeof scrollTo === "function") {
		scrollTo({ behavior: behavior ?? "auto", left: position.x, top: position.y });
	}
}

export function scrollToTop(): void {
	if (typeof scrollTo === "function") {
		scrollTo(0, 0);
	}
}

let currentHistoryIndex = 0;

export function getHistoryIndex(): number {
	return currentHistoryIndex;
}

export function setHistoryIndex(index: number): void {
	currentHistoryIndex = index;
}

export function incrementHistoryIndex(): void {
	currentHistoryIndex++;
}

export function initHistoryIndex(index: number): void {
	currentHistoryIndex = index;
}
