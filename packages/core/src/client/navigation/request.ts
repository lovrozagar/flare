import { BUILD_HEADER, KIND_PARAM, STALE_PARAM } from "../../shared/protocol/index.ts";
import type { LoadedEntry } from "../../shared/router/create-router.ts";
import { loadChain } from "../../shared/router/load-chain.ts";
import { cachedMatches, holds } from "../router/match-cache.ts";
import { framesOf, landFrames, type Landed, type Pending } from "./frames.ts";
import type { NavigateOptions, NavigatorDeps } from "./navigate.ts";
import type { Location } from "../../shared/url/index.ts";
import { isChunkError } from "./reload.ts";
import type { Target } from "./target.ts";

// What came back for one navigation: frames to commit, a bare status to paint, or nothing to do.
export type Arrival = { kind: "landed"; landing: Landed } | { kind: "status"; status: number } | { kind: "none" };

// One data request. `fill` asks for the stored page's `"stream"` values with `_flare=fill`, and its landing settles
// the `reuse` slots those holes left (dx/defer.md). `holes` hears that a landing ended with placeholders no frame
// settled, which only a stored body leaves.
export type Trip = {
	target: Extract<Target, { kind: "data" }>;
	options: NavigateOptions;
	trigger: "navigation" | "revalidation";
	signal: AbortSignal;
	fill: boolean;
	reuse?: Pending | undefined;
	holes?: ((pending: Pending) => void) | undefined;
};

// The route modules load in parallel with the data request. An aborted request and a network failure commit
// nothing. A missing chunk or a build mismatch is a guarded document load. A chunk error wins whichever of the
// two fails first.
export async function arrive(
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
	const plan = planOf(deps, trip);
	// Every page and layout is fresh in the client cache, so the commit reads them all from it (dx/cache.md, B19).
	if (plan.fresh && !trip.fill) return { kind: "landed", landing: { data: {}, heads: {} } };
	const reused = trip.options.revalidate === true ? undefined : await deps.prefetched?.(trip.target.dataUrl);
	// A prefetch never ran its deferred functions, so a landing still holding a placeholder needs the enter request.
	if (reused !== undefined && !holds(reused.data)) return { kind: "landed", landing: reused };
	const response = await deps.fetch(dataUrl(trip, plan.stale), { signal: trip.signal });
	const build = response.headers.get(BUILD_HEADER) ?? "";
	if (build !== "" && deps.build !== "" && build !== deps.build) {
		deps.reload(trip.target.url);
		return { kind: "none" };
	}
	// An input failure does not commit (dx/builder.md). Any other status paints the target's failure.
	if (response.status === 400) return { kind: "none" };
	if (response.status !== 200 || response.body === null) return { kind: "status", status: response.status };
	const options = { dev: deps.dev, send: deps.send, holes: trip.holes, reuse: trip.reuse, signal: trip.signal };
	return { kind: "landed", landing: await landFrames(framesOf(response.body), options) };
}

// The cache's verdict for this trip.
function planOf(deps: NavigatorDeps, trip: Trip): ReturnType<NavigatorDeps["cache"]["plan"]> {
	const current = deps.store.snapshot().location;
	return deps.cache.plan({
		matches: cachedMatches(trip.target.match, trip.target.location),
		trigger: trip.trigger,
		revalidate: trip.options.revalidate === true,
		current: { ...current, params: {} },
		next: { ...trip.target.location, params: {} },
	});
}

// The page ids the client holds fresh ride along as _flare_stale, so the server skips those loaders (B30). A fill
// asks for the same URL as its own kind.
function dataUrl(trip: Trip, stale: readonly string[]): string {
	const url = trip.fill ? trip.target.dataUrl.replace(`${KIND_PARAM}=data`, `${KIND_PARAM}=fill`) : trip.target.dataUrl;
	if (stale.length === 0) return url;
	return `${url}&${STALE_PARAM}=${encodeURIComponent(stale.join(" "))}`;
}

// The values of the page on screen, through a same-URL revalidation that writes no history (dx/defer.md).
export function fillOptions(deps: NavigatorDeps): NavigateOptions & { to: string } {
	const here = deps.store.snapshot().location;
	return { to: `${here.pathname}${here.search}${here.hash}`, revalidate: true, replace: true, scroll: false };
}

// Holes heard before the commit wait for it, so the fill revalidates the page the navigation landed, and only while
// that page is still on screen.
export function holeWatch(
	deps: NavigatorDeps,
	landed: Location,
	fill: (pending: Pending) => Promise<void>,
): { holes: (pending: Pending) => void; committed: () => void } {
	let held: Pending | undefined;
	let committed = false;
	const run = (pending: Pending): void => {
		if (sameUrl(deps.store.snapshot().location, landed)) void fill(pending);
	};
	return {
		holes: (pending) => {
			if (committed) run(pending);
			else held = pending;
		},
		committed: () => {
			committed = true;
			if (held !== undefined) run(held);
		},
	};
}

// The same page: pathname and search, whatever the hash.
export function sameUrl(left: Location, right: Location): boolean {
	return left.pathname === right.pathname && left.search === right.search;
}
