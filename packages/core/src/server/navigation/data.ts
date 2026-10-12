import type { Frame } from "../../shared/protocol/index.ts";
import type { HeadConfig } from "../../shared/route-builder/types.ts";
import { hints } from "../loaders/hints.ts";

// `route` is the route id, which names the slot. `id` is the match id the client lists in _flare_stale.
export type DataMatch = { route: string; id: string; layout: boolean };

export type DataEntry = DataMatch & { data: unknown; head?: HeadConfig };

// The page routes whose loader is not run because the client still holds that match (B30). A layout is never
// skipped.
export function skippedRoutes(matches: readonly DataMatch[], stale: string | null): ReadonlySet<string> {
	const skipped = hints(stale, matches);
	return new Set(matches.filter((match) => !match.layout && skipped.has(match.id)).map((match) => match.route));
}

// The `l` frames, then the `h` frames, root down. A skipped match writes neither.
export function dataFrames(entries: readonly DataEntry[], stale: string | null): Frame[] {
	const skipped = skippedRoutes(entries, stale);
	const written = entries.filter((entry) => !skipped.has(entry.route));
	const loaded = written.map((entry): Frame => ({ t: "l", m: entry.route, d: entry.data }));
	const heads = written.flatMap((entry): Frame[] =>
		entry.head === undefined ? [] : [{ t: "h", m: entry.route, d: entry.head }],
	);
	return [...loaded, ...heads];
}
