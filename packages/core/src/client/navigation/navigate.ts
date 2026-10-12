import { flush } from "solid-js";
import type { OutletMatch } from "../../shared/components/index.ts";
import type { DevErrorPayload } from "../../shared/errors/index.ts";
import { BUILD_HEADER, STALE_PARAM } from "../../shared/protocol/index.ts";
import { matchId } from "../../shared/route-tree/index.ts";
import { loadChain, type LoadedEntry, type Router } from "../../shared/router/create-router.ts";
import { readSearch, type Location } from "../../shared/url/index.ts";
import type { FlareHistory } from "../history/index.ts";
import type { CachedMatch, MatchCache } from "../router/match-cache.ts";
import type { RouterStore, StoreSnapshot } from "../router/store.ts";
import type { Blockers } from "./blocker.ts";
import { framesOf, landFrames, type Landed } from "./frames.ts";
import type { NavigationState } from "./pending.ts";
import { isChunkError } from "./reload.ts";
import type { ScrollStore } from "./scroll.ts";
import { resolveTarget, resolveUrl, type NavigateInput, type Target } from "./target.ts";

export type Landing = Landed;

export type NavigateOptions = NavigateInput & {
	replace?: boolean;
	revalidate?: boolean;
	scroll?: boolean;
	state?: unknown;
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
	send?: (payload: DevErrorPayload) => void;
	prefetched?: (dataUrl: string) => Promise<Landing> | undefined;
};

type DataTarget = Extract<Target, { kind: "data" }>;

type Trigger = "navigation" | "revalidation";

// What came back for one navigation: frames to commit, a bare status to paint, or nothing to do.
type Arrival = { kind: "landed"; landing: Landing } | { kind: "status"; status: number } | { kind: "none" };

const NAMED_STATUS: Record<number, string> = { 401: "UnauthenticatedError", 403: "UnauthorizedError" };

// Same-origin only. The DOM commits, then history is written. A revalidation of the current URL writes no
// history. Starting a navigation aborts the previous one, and only the latest may commit (02-system). A
// restore is one popstate step: the browser already moved, so no blocker runs, nothing is written, and the
// saved scroll comes back.
export function createNavigator(deps: NavigatorDeps): {
	navigate: (options: NavigateOptions) => Promise<void>;
	visit: (url: string, replace: boolean) => Promise<void>;
	restore: (url: string) => Promise<void>;
} {
	let latest: AbortController | undefined;
	const context = () => ({ router: deps.router, origin: deps.origin, current: deps.store.snapshot().location });
	const land = (location: Location, url: string, step: Step): void => {
		if (step.pop) return deps.scroll.restore(deps.history.index(), location);
		if (step.write) writeHistory(deps, url, step.options);
		deps.scroll.afterCommit({ hash: location.hash, scroll: step.options.scroll !== false });
	};
	const go = async (target: Target, options: NavigateOptions, pop = false): Promise<void> => {
		if (target.kind === "document") return void deps.assign(target.url);
		const snapshot = deps.store.snapshot();
		if (target.kind === "hash") {
			deps.store.commit({ ...snapshot, location: target.location });
			return land(target.location, target.url, { options, pop, write: true });
		}
		const trigger: Trigger = sameUrl(snapshot.location, target.location) ? "revalidation" : "navigation";
		if (!pop && !deps.blockers.run(blockerArgs(snapshot.location, target.location, trigger), noWrite())) return;
		latest?.abort();
		const controller = new AbortController();
		latest = controller;
		const settled = await deps.navigation.track(arrive(deps, { target, options, trigger, signal: controller.signal }));
		if (latest !== controller || settled === undefined) return;
		const { chain, arrival } = settled;
		if (arrival.kind === "none") return;
		if (arrival.kind === "landed" && arrival.landing.redirect !== undefined) {
			const { url, replace } = arrival.landing.redirect;
			if (new URL(url, deps.origin).origin !== deps.origin) return void deps.assign(url);
			return go(resolveUrl(url, context()), { ...options, replace });
		}
		deps.store.commit(nextSnapshot(deps, { target, chain, arrival, previous: snapshot }));
		// The DOM updates before history is written (02-system).
		flush();
		land(target.location, target.url, { options, pop, write: trigger === "navigation" });
	};
	return {
		navigate: (options) => go(resolveTarget(options, context()), options),
		visit: (url, replace) => go(resolveUrl(url, context()), { to: url, replace }),
		restore: (url) => go(resolveUrl(url, context()), { to: url }, true),
	};
}

type Step = { options: NavigateOptions; pop: boolean; write: boolean };

type Trip = { target: DataTarget; options: NavigateOptions; trigger: Trigger; signal: AbortSignal };

// The route modules load in parallel with the data request. An aborted request and a network failure commit
// nothing. A missing chunk or a build mismatch is a guarded document load.
async function arrive(
	deps: NavigatorDeps,
	trip: Trip,
): Promise<{ chain: LoadedEntry[]; arrival: Arrival } | undefined> {
	try {
		const [chain, arrival] = await Promise.all([loadChain(trip.target.match.chain), request(deps, trip)]);
		return { chain, arrival };
	} catch (error) {
		if (isChunkError(error)) deps.reload(trip.target.url);
		return undefined;
	}
}

async function request(deps: NavigatorDeps, trip: Trip): Promise<Arrival> {
	const reused = trip.options.revalidate === true ? undefined : await deps.prefetched?.(trip.target.dataUrl);
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

// A prefetch never ran its deferred functions, so a landing still holding a placeholder needs the enter request.
function holds(data: Record<string, unknown>): boolean {
	return JSON.stringify(data).includes('"__deferred":true');
}

// The page ids the client holds fresh ride along as _flare_stale, so the server skips those loaders (B30).
function dataUrl(deps: NavigatorDeps, trip: Trip): string {
	const matches = cachedMatches(trip.target);
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

// A match keeps its previous data and head when the response sent none for it, as a stale page does (B83).
function nextSnapshot(deps: NavigatorDeps, next: Next): StoreSnapshot {
	const params = defined(next.target.match.params);
	const search = readSearch(next.target.location.search);
	const landing: Landing = next.arrival.kind === "landed" ? next.arrival.landing : { data: {}, heads: {} };
	const earlier = (id: string) => next.previous.matches.findIndex((match) => match.id === id);
	const matches = next.chain.map((entry): OutletMatch => {
		const kept = earlier(entry.id);
		const data = entry.id in landing.data ? landing.data[entry.id] : next.previous.matches[kept]?.data;
		return { id: entry.id, kind: entry.kind, module: entry.module, params, search, data };
	});
	const heads = next.chain.map((entry) => landing.heads[entry.id] ?? next.previous.heads[earlier(entry.id)]);
	const snapshot: StoreSnapshot = { matches, heads, location: next.target.location };
	const failure =
		next.arrival.kind === "status"
			? statusFailure(next.arrival.status, matches.length - 1)
			: landedFailure(landing, matches);
	if (failure !== undefined) snapshot.failure = failure;
	remember(deps, cachedMatches(next.target), landing);
	return snapshot;
}

// The cache and the stale plan key a match alike: raw params plus the raw search (B31).
function cachedMatches(target: DataTarget): CachedMatch[] {
	const params = defined(target.match.params);
	const search = readSearch(target.location.search);
	const id = matchId(params, target.location.search.slice(1));
	return target.match.chain.map((entry) => ({ route: entry.id, id, layout: entry.kind === "layout", params, search }));
}

function statusFailure(status: number, index: number): StoreSnapshot["failure"] {
	const error = new Error("Request failed");
	error.name = NAMED_STATUS[status] ?? "Error";
	error.stack = "";
	return { index, status: status in NAMED_STATUS ? status : 500, error };
}

function landedFailure(landing: Landing, matches: readonly OutletMatch[]): StoreSnapshot["failure"] {
	const failure = landing.failure;
	if (failure === undefined) return undefined;
	return {
		index: matches.findIndex((match) => match.id === failure.route),
		status: failure.status,
		error: failure.error,
	};
}

// Only successful `l` payloads are cached. A failed match is evicted (match-cache.ts).
function remember(deps: NavigatorDeps, matches: readonly CachedMatch[], landing: Landing): void {
	for (const match of matches) {
		const data = landing.data[match.route];
		if (landing.failure?.route === match.route) deps.cache.evict(match);
		else if (match.route in landing.data) deps.cache.store(match, { data, deferred: holds({ d: data }) });
	}
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

function defined(params: Record<string, string | string[] | undefined>): Record<string, string | string[]> {
	return Object.fromEntries(
		Object.entries(params).flatMap(([name, value]) => (value === undefined ? [] : [[name, value]])),
	);
}
