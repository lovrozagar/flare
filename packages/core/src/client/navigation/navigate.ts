import { flush } from "solid-js";
import type { OutletMatch } from "../../shared/components/index.ts";
import type { DevErrorPayload } from "../../shared/errors/index.ts";
import { BUILD_HEADER, STALE_PARAM } from "../../shared/protocol/index.ts";
import type { Intercept } from "../../shared/route-builder/chain.ts";
import {
	loadChain,
	type LoadedEntry,
	type Router,
	type ViewTransitionOptions,
} from "../../shared/router/create-router.ts";
import { readSearch, type Location } from "../../shared/url/index.ts";
import type { FlareHistory } from "../history/index.ts";
import { cachedMatches, defined, holds, remember, type MatchCache } from "../router/match-cache.ts";
import { landedFailure, statusFailure, swappedDepth, type RouterStore, type StoreSnapshot } from "../router/store.ts";
import {
	runTransition,
	stepDirection,
	transitionInfo,
	transitionOption,
	type Direction,
} from "../view-transition/index.ts";
import type { Blockers } from "./blocker.ts";
import { framesOf, landFrames, type Landed } from "./frames.ts";
import { closesOverlay, overlayFor, showOverlay, type Mode } from "./overlay.ts";
import type { NavigationState } from "./pending.ts";
import { isChunkError } from "./reload.ts";
import type { ScrollStore } from "./scroll.ts";
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

// What came back for one navigation: frames to commit, a bare status to paint, or nothing to do.
type Arrival = { kind: "landed"; landing: Landing } | { kind: "status"; status: number } | { kind: "none" };

// Same-origin only. The DOM commits, then history is written. A revalidation of the current URL writes no
// history. Starting a navigation aborts the previous one, and only the latest may commit (02-system). A
// restore is one popstate step: the browser already moved, so no blocker runs, nothing is written, and the
// saved scroll comes back. Back onto an overlay's background clears the overlay, with no fetch and no scroll.
export function createNavigator(deps: NavigatorDeps): {
	navigate: (options: NavigateOptions) => Promise<void>;
	visit: (url: string, replace: boolean) => Promise<void>;
	restore: (url: string, index: number) => Promise<void>;
} {
	let latest: AbortController | undefined;
	// The history index the screen shows, so a popstate step knows its view-transition direction.
	let at = deps.history.index();
	const context = () => ({ router: deps.router, origin: deps.origin, current: deps.store.snapshot().location });
	const go = async (target: Target, options: NavigateOptions, mode: Mode = {}): Promise<void> => {
		if (target.kind === "document") return void deps.assign(target.url);
		const snapshot = deps.store.snapshot();
		const pop = mode.pop === true;
		if (target.kind === "hash") {
			deps.store.commit({ ...snapshot, location: target.location });
			return land(deps, target, { options, pop, write: true });
		}
		const plan = planOf({ target, options, snapshot, mode: { ...mode, at } });
		if (!pop && !deps.blockers.run(blockerArgs(snapshot.location, target.location, plan.trigger), noWrite())) return;
		latest?.abort();
		const controller = new AbortController();
		latest = controller;
		const settled = await deps.navigation.track(arrive(deps, { ...plan, signal: controller.signal }));
		if (latest !== controller || settled === undefined || settled.arrival.kind === "none") return;
		const redirect = settled.arrival.kind === "landed" ? settled.arrival.landing.redirect : undefined;
		if (redirect === undefined) {
			await settle(deps, plan, { chain: settled.chain, arrival: settled.arrival });
			at = deps.history.index();
			return;
		}
		if (new URL(redirect.url, deps.origin).origin !== deps.origin) return void deps.assign(redirect.url);
		return go(resolveUrl(redirect.url, context()), { ...options, replace: redirect.replace });
	};
	return {
		navigate: (options) => go(resolveTarget(options, context()), options),
		visit: (url, replace) => go(resolveUrl(url, context()), { to: url, replace }),
		restore: async (url, index) => {
			const closed = closesOverlay(deps.store.snapshot(), url);
			if (closed !== undefined) {
				at = index;
				return deps.store.commit(closed);
			}
			return go(
				resolveUrl(url, context()),
				{ to: url },
				{ pop: true, overlay: deps.history.interceptedAt(index), index },
			);
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
	const plan: Plan = { target, options: input.options, trigger, pop, previous: snapshot, direction };
	const intercept = overlayFor(target, snapshot, { trigger, ...input.mode });
	if (intercept !== undefined) plan.intercept = intercept;
	return plan;
}

// A landed overlay keeps the background. Anything else, a failed overlay fetch included, commits as a visit.
async function settle(
	deps: NavigatorDeps,
	plan: Plan,
	settled: { chain: LoadedEntry[]; arrival: Exclude<Arrival, { kind: "none" }> },
) {
	const { target, previous, arrival } = { ...plan, arrival: settled.arrival };
	if (plan.intercept !== undefined && arrival.kind === "landed" && arrival.landing.failure === undefined) {
		const write = !plan.pop && plan.trigger === "navigation";
		return showOverlay(deps, {
			target,
			chain: settled.chain,
			landing: arrival.landing,
			previous,
			intercept: plan.intercept,
			write,
			state: plan.options.state,
		});
	}
	const next = nextSnapshot(deps, { target, chain: settled.chain, arrival, previous });
	// The DOM updates, inside a view transition when one is on, before history is written (02-system).
	await runTransition({
		option: transitionOption(plan.options.viewTransition, deps.router.viewTransitions),
		info: transitionInfo(plan.direction, previous.overlay?.location ?? previous.location, target.location),
		auto: () => deps.store.scopeAt(swappedDepth(previous, next)),
		update: () => {
			deps.store.commit(next);
			flush();
		},
	});
	land(deps, target, { options: plan.options, pop: plan.pop, write: plan.trigger === "navigation" });
}

function land(deps: NavigatorDeps, target: { url: string; location: Location }, step: Step): void {
	if (step.pop) return deps.scroll.restore(deps.history.index(), target.location);
	if (step.write) writeHistory(deps, target.url, step.options);
	deps.scroll.afterCommit({ hash: target.location.hash, scroll: step.options.scroll !== false });
}

type Step = { options: NavigateOptions; pop: boolean; write: boolean };

type Trip = Plan & { signal: AbortSignal };

// The route modules load in parallel with the data request. An aborted request and a network failure commit
// nothing. A missing chunk or a build mismatch is a guarded document load. A chunk error wins whichever of the
// two fails first.
async function arrive(
	deps: NavigatorDeps,
	trip: Trip,
): Promise<{ chain: LoadedEntry[]; arrival: Arrival } | undefined> {
	const [chain, arrival] = await Promise.allSettled([loadChain(trip.target.match.chain), request(deps, trip)]);
	if (chain.status === "rejected") {
		if (isChunkError(chain.reason)) deps.reload(trip.target.url);
		return undefined;
	}
	return arrival.status === "fulfilled" ? { chain: chain.value, arrival: arrival.value } : undefined;
}

async function request(deps: NavigatorDeps, trip: Trip): Promise<Arrival> {
	const reused = trip.options.revalidate === true ? undefined : await deps.prefetched?.(trip.target.dataUrl);
	// A prefetch never ran its deferred functions, so a landing still holding a placeholder needs the enter request.
	if (reused !== undefined && !holds(reused.data)) return { kind: "landed", landing: reused };
	const response = await deps.fetch(dataUrl(deps, trip), { signal: trip.signal });
	const build = response.headers.get(BUILD_HEADER) ?? "";
	if (build !== "" && deps.build !== "" && build !== deps.build) {
		deps.reload(trip.target.url);
		return { kind: "none" };
	}
	// An input failure does not commit (dx/builder.md). Any other status paints the target's failure.
	if (response.status === 400) return { kind: "none" };
	if (response.status !== 200 || response.body === null) return { kind: "status", status: response.status };
	return { kind: "landed", landing: await landFrames(framesOf(response.body), { dev: deps.dev, send: deps.send }) };
}

// The page ids the client holds fresh ride along as _flare_stale, so the server skips those loaders (B30).
function dataUrl(deps: NavigatorDeps, trip: Trip): string {
	const matches = cachedMatches(trip.target.match, trip.target.location);
	const current = deps.store.snapshot().location;
	const plan = deps.cache.plan({
		matches,
		trigger: trip.trigger,
		revalidate: trip.options.revalidate === true,
		current: place(current),
		next: place(trip.target.location),
	});
	if (plan.stale.length === 0) return trip.target.dataUrl;
	return `${trip.target.dataUrl}&${STALE_PARAM}=${encodeURIComponent(plan.stale.join(" "))}`;
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

function writeHistory(deps: NavigatorDeps, url: string, options: NavigateOptions): void {
	deps.scroll.save(deps.history.index(), deps.store.snapshot().location);
	if (options.replace === true) deps.history.replace(url, options.state);
	else deps.history.push(url, options.state);
}

function sameUrl(left: Location, right: Location): boolean {
	return left.pathname === right.pathname && left.search === right.search;
}

function place(location: Location) {
	return { ...location, params: {} };
}

function blockerArgs(current: Location, next: Location, trigger: Trigger) {
	return { current: place(current), next: place(next), trigger };
}

function noWrite() {
	// navigate asks the blocker before it writes anything, so nothing was pushed and history.go is not reached.
	return { write: () => undefined, pushed: 0, go: history.go.bind(history) };
}
