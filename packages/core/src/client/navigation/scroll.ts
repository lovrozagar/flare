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
};

export type ScrollStore = {
	setup: () => void;
	save: (index: number, location: Location) => void;
	restore: (index: number, location: Location) => void;
	afterCommit: (target: { hash: string; scroll: boolean }) => void;
};

type Saved = Record<string, { x: number; y: number }>;

const STORAGE_KEY = "flare_scroll";

// Positions live in sessionStorage, keyed by history index unless the router gives a key (02-system step 7).
// The oldest entries drop past maxEntries.
export function createScroll(options: ScrollOptions, env: ScrollEnv): ScrollStore {
	if (!Number.isInteger(options.maxEntries) || options.maxEntries < 1 || options.maxEntries > 200) {
		throw new Error("scrollRestorationMaxEntries is an integer from 1 to 200");
	}
	const keyOf = (index: number, location: Location): string => options.key?.(location) ?? String(index);
	const move = (left: number, top: number): void => env.scrollTo({ left, top, behavior: options.behavior });
	return {
		// A document load sets the mode and does not read the store.
		setup() {
			if (options.enabled) env.history.scrollRestoration = "manual";
		},
		save(index, location) {
			if (!options.enabled) return;
			const key = keyOf(index, location);
			const saved = read(env.storage);
			delete saved[key];
			saved[key] = env.position();
			const entries = Object.entries(saved).slice(-options.maxEntries);
			env.storage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
		},
		restore(index, location) {
			if (!options.enabled) return;
			const spot = read(env.storage)[keyOf(index, location)] ?? { x: 0, y: 0 };
			move(spot.x, spot.y);
		},
		// After a commit the page goes to the hash target, or to the top, unless the navigation kept the scroll.
		afterCommit(target) {
			if (!target.scroll) return;
			const element = target.hash === "" ? null : env.element(target.hash.slice(1));
			if (element === null) move(0, 0);
			else element.scrollIntoView();
		},
	};
}

// A change in the hash alone does not fetch. It updates the URL and scrolls.
export function isHashOnly(from: Location, to: Location): boolean {
	return from.pathname === to.pathname && from.search === to.search && from.hash !== to.hash;
}

function read(storage: Storage): Saved {
	const raw = storage.getItem(STORAGE_KEY);
	if (raw === null) return {};
	const saved: Saved = JSON.parse(raw);
	return saved;
}
