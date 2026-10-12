import { defined } from "../../shared/errors/index.ts";
import type { Frame } from "../../shared/protocol/index.ts";
import type { DataFrame, LoaderFrame } from "../loaders/cascade.ts";
import { hints } from "../loaders/hints.ts";
import type { LoaderRun } from "../loaders/run.ts";

// `route` is the route id, which names the slot. `id` is the match id the client lists in _flare_stale.
export type DataMatch = { route: string; id: string; layout: boolean };

// The page routes whose loader is not run because the client still holds that match (B30). A layout is never
// skipped.
export function skippedRoutes(matches: readonly DataMatch[], stale: string | null): ReadonlySet<string> {
	const skipped = hints(stale, matches);
	return new Set(matches.filter((match) => !match.layout && skipped.has(match.id)).map((match) => match.route));
}

// The `l` frames and the loader `e` frame, then the `h` frames, root down. A skipped match writes neither
// `l` nor `h`.
// A match whose preloader context has keys carries it as `p`. A match with `.input()` carries its output as `v`,
// because the client never runs validators (02-system, B8).
export function dataFrames(
	run: Pick<LoaderRun, "frames" | "heads" | "contexts" | "inputs">,
	skipped: ReadonlySet<string>,
): { loaded: LoaderFrame[]; heads: Frame[] } {
	const kept = run.frames.filter((frame) => frame.t === "l");
	const loaded = run.frames
		.filter((frame) => frame.t !== "l" || !skipped.has(frame.m))
		.map((frame) => (frame.t === "l" ? carried(frame, run, kept.indexOf(frame)) : frame));
	const heads = kept.flatMap((frame, index): Frame[] => {
		const head = run.heads[index];
		return head === undefined || skipped.has(frame.m) ? [] : [{ t: "h", m: frame.m, d: head }];
	});
	return { loaded, heads };
}

function carried(frame: DataFrame, run: Pick<LoaderRun, "contexts" | "inputs">, index: number): DataFrame {
	const context = run.contexts[index];
	const input = defined(run.inputs[index], "the frame's input");
	const out: DataFrame = { ...frame };
	if (context !== undefined && Object.keys(context).length > 0) out.p = context;
	if (input.validated) out.v = { params: input.params, search: input.search };
	return out;
}
