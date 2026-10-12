import { statusOf } from "../../shared/errors/status.ts";

export type RequestKind = "document" | "data" | "prefetch";

export type Settled = { ok: true; data: unknown } | { ok: false; error: unknown };

export type Outcome = { id: string; settled: Settled };

export type DataFrame = { t: "l"; m: string; d: unknown };

export type LoaderFrame = DataFrame | { t: "e"; m: string; e: unknown };

export type Boundary = "errorRender" | "notFoundRender" | "unauthenticatedRender" | "unauthorizedRender";

export type Failed = { m: string; status: number; boundary: Boundary; error: unknown };

// `kept` is the root-down prefix above the first failure, whatever the request kind. Those matches render
// and run .head() and .headers(). `frames` is what the request kind may serialize.
export type Cascade = {
	status: number;
	frames: readonly LoaderFrame[];
	kept: readonly DataFrame[];
	failed?: Failed;
};

// Outcomes are root-down. Everything below the first failed match is dropped, even when its loader
// returned data (B29): a failed layout gate must not leak a descendant's data.
export function cascade(kind: RequestKind, outcomes: readonly Outcome[]): Cascade {
	const kept: DataFrame[] = [];
	for (const outcome of outcomes) {
		const settled = outcome.settled;
		if (!settled.ok) return failAt(kind, kept, { m: outcome.id, error: settled.error });
		kept.push({ t: "l", m: outcome.id, d: settled.data });
	}
	return { status: 200, frames: kept, kept };
}

function failAt(kind: RequestKind, kept: readonly DataFrame[], at: { m: string; error: unknown }): Cascade {
	const status = statusOf(at.error);
	const failed = { ...at, status, boundary: boundaryOf(status) };
	if (kind === "document") return { status, frames: kept, kept, failed };
	if (status !== 500) return { status, frames: [], kept, failed };
	return { status: 200, frames: [...kept, { t: "e", m: at.m, e: at.error }], kept, failed };
}

function boundaryOf(status: number): Boundary {
	if (status === 404) return "notFoundRender";
	if (status === 401) return "unauthenticatedRender";
	if (status === 403) return "unauthorizedRender";
	return "errorRender";
}
