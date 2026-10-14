import type { Location } from "../../shared/url/index.ts";

export type ScrollOptions = {
	enabled: boolean;
	behavior: "instant" | "auto" | "smooth";
	maxEntries: number;
	key?: (location: Location) => string;
};

// The window and storage the scroll store reads, passed in so a test can observe them.
export type ScrollEnv = {
	history: { scrollRestoration: string };
	storage: Storage;
	position: () => { x: number; y: number };
	scrollTo: (spot: { left: number; top: number; behavior: ScrollBehavior }) => void;
	element: (id: string) => Element | null;
	// Calls back when the page may have grown, until the returned stop. Absent, a short page is restored once.
	grown?: ((onGrow: () => void) => () => void) | undefined;
};

export type ScrollStore = {
	setup: () => void;
	save: (index: number, location: Location) => void;
	restore: (index: number, location: Location) => void;
	afterCommit: (target: { hash: string; scroll: boolean }) => void;
};

// Oldest first. An array keeps insertion order, which an object with integer-like keys does not.
type Saved = Array<[key: string, spot: { x: number; y: number }]>;

const STORAGE_KEY = "flare_scroll";

// Positions live in sessionStorage, keyed by history index unless the router gives a key (02-system step 7).
// The oldest entries drop past maxEntries.
export function createScroll(options: ScrollOptions, env: ScrollEnv): ScrollStore {
	if (!Number.isInteger(options.maxEntries) || options.maxEntries < 1 || options.maxEntries > 200) {
		throw new Error("scrollRestorationMaxEntries is an integer from 1 to 200");
	}
	const keyOf = (index: number, location: Location): string => options.key?.(location) ?? String(index);
	const move = (left: number, top: number): void => env.scrollTo({ left, top, behavior: options.behavior });
	let growing: (() => void) | undefined;
	// The next navigation's scroll ends a restore that was still waiting for the page to grow.
	const settle = (): void => {
		growing?.();
		growing = undefined;
	};
	return {
		// A document load sets the mode and does not read the store.
		setup() {
			if (options.enabled) env.history.scrollRestoration = "manual";
		},
		save(index, location) {
			settle();
			if (!options.enabled) return;
			const key = keyOf(index, location);
			const saved = read(env.storage).filter(([stored]) => stored !== key);
			saved.push([key, env.position()]);
			write(env.storage, saved.slice(-options.maxEntries));
		},
		// A page that cannot scroll that far yet is restored as far as it can be, then again as its layout grows, until
		// the position is reached or the next navigation scrolls (B108).
		restore(index, location) {
			settle();
			if (!options.enabled) return;
			const key = keyOf(index, location);
			const [, spot] = read(env.storage).find(([stored]) => stored === key) ?? [key, { x: 0, y: 0 }];
			move(spot.x, spot.y);
			const reached = (): boolean => env.position().y >= spot.y - 1;
			if (reached() || env.grown === undefined) return;
			growing = env.grown(() => {
				move(spot.x, spot.y);
				if (reached()) settle();
			});
		},
		// After a commit the page goes to the hash target, or to the top, unless the navigation kept the scroll.
		afterCommit(target) {
			settle();
			if (!target.scroll) return;
			const element = target.hash === "" ? null : env.element(decodeHash(target.hash.slice(1)));
			if (element === null) move(0, 0);
			else element.scrollIntoView();
		},
	};
}

// User input that ends a restore still waiting for the page to grow, and the longest it waits.
const INPUT = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
const GROW_MS = 10_000;

// The window's growth signal for a restore (B108): the document element's size, until the user scrolls, types, or
// taps, or GROW_MS pass. Without ResizeObserver there is none.
export function pageGrowth(scope: typeof globalThis): ScrollEnv["grown"] {
	if (typeof scope.ResizeObserver !== "function") return undefined;
	return (onGrow) => {
		const observer = new scope.ResizeObserver(() => onGrow());
		const stop = (): void => {
			observer.disconnect();
			scope.clearTimeout(timer);
			for (const event of INPUT) scope.removeEventListener(event, stop);
		};
		const timer = scope.setTimeout(stop, GROW_MS);
		for (const event of INPUT) scope.addEventListener(event, stop, { passive: true });
		observer.observe(scope.document.documentElement);
		return stop;
	};
}

// A change in the hash alone does not fetch. It updates the URL and scrolls.
export function isHashOnly(from: Location, to: Location): boolean {
	return from.pathname === to.pathname && from.search === to.search && from.hash !== to.hash;
}

// Storage can be disabled, full, or hold a value Flare did not write. None of that may break a navigation:
// an unreadable store counts as empty, and a failed write is skipped.
function read(storage: Storage): Saved {
	try {
		const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? "[]");
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function write(storage: Storage, saved: Saved): void {
	try {
		storage.setItem(STORAGE_KEY, JSON.stringify(saved));
	} catch {
		// Quota or a disabled store: this position is not kept.
	}
}

// `#caf%C3%A9` names the element `café`. A malformed escape is looked up as written.
function decodeHash(hash: string): string {
	try {
		return decodeURIComponent(hash);
	} catch {
		return hash;
	}
}
