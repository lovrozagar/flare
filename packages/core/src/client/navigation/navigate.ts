import { flush } from "solid-js";
import type { OutletMatch } from "../../shared/components/index.ts";
import type { DevErrorPayload } from "../../shared/errors/index.ts";
import type { Intercept } from "../../shared/route-builder/chain.ts";
import type { LoadedEntry, Router, ViewTransitionOptions } from "../../shared/router/create-router.ts";
import { readSearch, type Location } from "../../shared/url/index.ts";
import type { FlareHistory } from "../history/index.ts";
import { cachedMatches, defined, remember, type MatchCache } from "../router/match-cache.ts";
import { landedFailure, statusFailure, swappedDepth, type RouterStore, type StoreSnapshot } from "../router/store.ts";
import {
	runTransition,
	stepDirection,
	transitionInfo,
	transitionOption,
	type Direction,
} from "../view-transition/index.ts";
import { allowsNavigation, type Blockers } from "./blocker.ts";
import type { Landed, Pending } from "./frames.ts";
import { closesOverlay, overlayFor, showOverlay, type Mode } from "./overlay.ts";
import type { NavigationState } from "./pending.ts";
import type { ScrollStore } from "./scroll.ts";
import { arrive, fillOptions, holeWatch, sameUrl, type Arrival } from "./request.ts";
import { resolveTarget, resolveUrl, type NavigateInput, type Target } from "./target.ts";

export type Landing = Landed;

export type NavigateOptions = NavigateInput & {
	replace?: boolean | undefined;
	revalidate?: boolean | undefined;
	scroll?: boolean | undefined;
	state?: unknown | undefined;
	viewTransition?: boolean | ViewTransitionOptions | undefined;
};

export type NavigatorDeps = {
	router: Router;
	store: RouterStore;
	history: FlareHistory;
	scroll: ScrollStore;
	blockers: Blockers;
	navigation: NavigationState;
	cache: MatchCache;
	fetch: (url: string, init: RequestInit) => Promise<Response>;
	origin: string;
	assign: (href: string) => void;
	reload: (href: string) => boolean;
	build: string;
	dev: boolean;
	send?: ((payload: DevErrorPayload) => void) | undefined;
	prefetched?: (dataUrl: string) => Promise<Landing | undefined> | undefined;
};

type DataTarget = Extract<Target, { kind: "data" }>;

type Trigger = "navigation" | "revalidation";

// Same-origin only. The DOM commits, then history is written. A revalidation of the current URL writes no
// history. Starting a navigation aborts the previous one, and only the latest may commit (02-system). A
// restore is one popstate step: the browser already moved, so no blocker runs, nothing is written, and the
// saved scroll comes back. Back onto an overlay's background clears the overlay, with no fetch and no scroll.
export function createNavigator(deps: NavigatorDeps): {
	navigate: (options: NavigateOptions) => Promise<void>;
	visit: (url: string, replace: boolean) => Promise<void>;
	restore: (url: string, index: number) => Promise<void>;
	fill: (pending: Pending) => Promise<void>;
} {
	let latest: AbortController | undefined;
	// The history index the screen shows, so a popstate step knows its view-transition direction.
	let at = deps.history.index();
	const context = () => ({ router: deps.router, origin: deps.origin, current: deps.store.snapshot().location });
	const go = async (target: Target, options: NavigateOptions, mode: Mode = {}): Promise<void> => {
		if (target.kind === "document") return void deps.assign(target.url);
		const snapshot = deps.store.snapshot();
		const pop = mode.pop === true;
		if (target.kind !== "data") {
			at = inPlace(deps, target, { options, snapshot, pop }) ?? at;
			return;
		}
		const plan = planOf({ target, options, snapshot, mode: { ...mode, at } });
		const move = { current: snapshot.location, next: target.location, trigger: plan.trigger };
		if (!pop && !allowsNavigation(deps.blockers, move)) return;
		latest?.abort();
		const controller = new AbortController();
		latest = controller;
		// A stored landing can end with a `"stream"` hole. Once this page commits, one fill asks for its values.
		const watch = holeWatch(deps, target.location, fill);
		const trip = { ...plan, signal: controller.signal, reuse: mode.fill, holes: plan.fill ? undefined : watch.holes };
		const settled = await deps.navigation.track(arrive(deps, trip));
		if (latest !== controller || settled === undefined || settled.arrival.kind === "none") return;
		const redirect = settled.arrival.kind === "landed" ? settled.arrival.landing.redirect : undefined;
		if (redirect !== undefined) {
			return follow(deps, redirect.url, () =>
				go(resolveUrl(redirect.url, context()), { ...options, replace: redirect.replace }),
			);
		}
		if (!(await settle(deps, plan, { chain: settled.chain, arrival: settled.arrival }))) return;
		at = deps.history.index();
		return watch.committed();
	};
	const fill = (pending: Pending): Promise<void> => {
		const options = fillOptions(deps);
		return go(resolveUrl(options.to, context()), options, { fill: pending });
	};
	return {
		fill,
		navigate: (options) => go(resolveTarget(options, context()), options),
		visit: (url, replace) => go(resolveUrl(url, context()), { to: url, replace }),
		restore: async (url, index) => {
			const closed = closesOverlay(deps.store.snapshot(), url);
			if (closed !== undefined) {
				at = index;
				return void deps.store.commit(closed);
			}
			const mode = { pop: true, overlay: deps.history.interceptedAt(index), index };
			return go(resolveUrl(url, context()), { to: url }, mode);
		},
	};
}

// One navigation before its request: the trigger, whether it is a popstate step, and the overlay it opens.
type Plan = {
	target: DataTarget;
	options: NavigateOptions;
	trigger: Trigger;
	pop: boolean;
	previous: StoreSnapshot;
	direction: Direction;
	intercept?: Intercept;
	// A same-URL revalidation that asks for a stored page's `"stream"` values (request.ts).
	fill: boolean;
};

function planOf(input: {
	target: DataTarget;
	options: NavigateOptions;
	snapshot: StoreSnapshot;
	mode: Mode & { at: number };
}): Plan {
	const { target, snapshot } = input;
	// With an overlay open, the URL in the bar is the overlay's.
	const here = snapshot.overlay?.location ?? snapshot.location;
	const trigger: Trigger = sameUrl(here, target.location) ? "revalidation" : "navigation";
	const pop = input.mode.pop === true;
	const step = input.mode.index ?? input.mode.at;
	// A push moves forward. A popstate step moves by its index. A replace and a revalidation stay.
	const forward = !pop && trigger === "navigation" && input.options.replace !== true;
	const direction = forward ? "forward" : stepDirection(input.mode.at, step);
	const fill = input.mode.fill !== undefined;
	const plan: Plan = { target, options: input.options, trigger, pop, previous: snapshot, direction, fill };
	const intercept = overlayFor(target, snapshot, { trigger, ...input.mode });
	if (intercept !== undefined) plan.intercept = intercept;
	return plan;
}

// A landed overlay keeps the background. Anything else, a failed overlay fetch included, commits as a visit.
async function settle(
	deps: NavigatorDeps,
	plan: Plan,
	settled: { chain: LoadedEntry[]; arrival: Exclude<Arrival, { kind: "none" }> },
): Promise<boolean> {
	const { target, previous, arrival } = { ...plan, arrival: settled.arrival };
	if (plan.intercept !== undefined && arrival.kind === "landed" && arrival.landing.failure === undefined) {
		const write = !plan.pop && plan.trigger === "navigation";
		showOverlay(deps, {
			target,
			chain: settled.chain,
			landing: arrival.landing,
			previous,
			intercept: plan.intercept,
			write,
			state: plan.options.state,
		});
		return true;
	}
	const next = nextSnapshot(deps, { target, chain: settled.chain, arrival, previous });
	// The DOM updates, in a view transition when one is on, then history and scroll, once the commit is on screen (B106).
	let shown = Promise.resolve(false);
	await runTransition({
		option: transitionOption(plan.options.viewTransition, deps.router.viewTransitions),
		info: transitionInfo(plan.direction, previous.overlay?.location ?? previous.location, target.location),
		auto: () => deps.store.scopeAt(swappedDepth(previous, next)),
		update: () => {
			shown = deps.store.commit(next);
			flush();
		},
	});
	if (!(await shown)) return false;
	land(deps, target, { options: plan.options, pop: plan.pop, write: plan.trigger === "navigation" });
	return true;
}

function land(deps: NavigatorDeps, target: { url: string; location: Location }, step: Step): void {
	if (step.pop) return deps.scroll.restore(deps.history.index(), target.location);
	if (step.write) writeHistory(deps, target.url, step.options);
	deps.scroll.afterCommit({ hash: target.location.hash, scroll: step.options.scroll !== false });
}

type Step = { options: NavigateOptions; pop: boolean; write: boolean };

// A hash move and a shallow navigation stay on the page: no request and no loader. A shallow one asks the blocker
// first, and the page's search becomes the call's, the validator output the URL was written from, since the client
// graph has no validator. Layouts keep theirs until their next loader run (dx/navigate.md `shallow`, BUGS.md B18).
// The returned history index keeps the navigator's `at`: invariant upkeep with no observable effect, since only a
// data pop reads `at` and a pop off a hash entry is a hash move.
function inPlace(
	deps: NavigatorDeps,
	target: Exclude<Target, { kind: "document" | "data" }>,
	step: { options: NavigateOptions; snapshot: StoreSnapshot; pop: boolean },
): number | undefined {
	const { snapshot } = step;
	let matches = snapshot.matches;
	if (target.kind === "shallow") {
		const move = { current: snapshot.location, next: target.location, trigger: "navigation" as const };
		if (!allowsNavigation(deps.blockers, move)) return undefined;
		const search = { ...target.search } as OutletMatch["search"];
		matches = matches.map((match, index) => (index === matches.length - 1 ? { ...match, search } : match));
	}
	void deps.store.commit({ ...snapshot, location: target.location, matches });
	land(deps, target, { options: step.options, pop: step.pop, write: true });
	return deps.history.index();
}

type Next = {
	target: DataTarget;
	chain: readonly LoadedEntry[];
	arrival: Exclude<Arrival, { kind: "none" }>;
	previous: StoreSnapshot;
};

// A match the response sent nothing for keeps what the client holds: a page skipped as stale takes its cached
// data, head, and `v`, and any other match keeps the previous screen's (B30, B83). No `v` paints the raw records.
function nextSnapshot(deps: NavigatorDeps, next: Next): StoreSnapshot {
	const params = defined(next.target.match.params);
	const search = readSearch(next.target.location.search);
	const landing: Landing = next.arrival.kind === "landed" ? next.arrival.landing : { data: {}, heads: {} };
	const cached = cachedMatches(next.target.match, next.target.location);
	const held = cached.map((match) => (match.route in landing.data ? undefined : deps.cache.read(match)));
	const earlier = (id: string) => next.previous.matches.findIndex((match) => match.id === id);
	const matches = next.chain.map((entry, index): OutletMatch => {
		const previous = next.previous.matches[earlier(entry.id)];
		const landed = entry.id in landing.data;
		const data = landed ? landing.data[entry.id] : (held[index] ?? previous)?.data;
		const kept = landed ? landing.preloaders?.[entry.id] : (held[index] ?? previous)?.preloader;
		const values = (landed ? landing.values?.[entry.id] : held[index]?.values) ?? { params, search };
		return { id: entry.id, kind: entry.kind, module: entry.module, ...values, data, preloader: kept ?? {} };
	});
	const heads = next.chain.map(
		(entry, index) => landing.heads[entry.id] ?? held[index]?.head ?? next.previous.heads[earlier(entry.id)],
	);
	const snapshot: StoreSnapshot = { matches, heads, location: next.target.location };
	const failure =
		next.arrival.kind === "status"
			? statusFailure(next.arrival.status, matches.length - 1)
			: landedFailure(landing, matches);
	if (failure !== undefined) snapshot.failure = failure;
	remember(deps.cache, cached, landing);
	return snapshot;
}

// An `x` frame: a same-origin target is the next navigation, another origin a document load.
function follow(deps: NavigatorDeps, url: string, next: () => Promise<void>): Promise<void> {
	if (new URL(url, deps.origin).origin !== deps.origin) return Promise.resolve(deps.assign(url));
	return next();
}

function writeHistory(deps: NavigatorDeps, url: string, options: NavigateOptions): void {
	deps.scroll.save(deps.history.index(), deps.store.snapshot().location);
	if (options.replace === true) deps.history.replace(url, options.state);
	else deps.history.push(url, options.state);
}
