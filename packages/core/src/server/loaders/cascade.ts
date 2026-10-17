import { defined } from "../../shared/errors/index.ts"
import { boundaryKind, type BoundaryKind } from "../../shared/components/index.ts"
import { rankStatus, statusOf } from "../../shared/errors/status.ts"

export type RequestKind = "document" | "data" | "prefetch" | "fill"

export type Settled = { ok: true; data: unknown } | { ok: false; error: unknown }

export type Outcome = { id: string; settled: Settled }

export type DataFrame = {
	t: "l"
	m: string
	d: unknown
	p?: Record<string, unknown>
	v?: { params: unknown; search: unknown }
}

export type LoaderFrame = DataFrame | { t: "e"; m: string; e: unknown }

export type Failed = { m: string; status: number; boundary: BoundaryKind; error: unknown }

// `kept` is the root-down prefix above the first failure, whatever the request kind. Those matches render
// and run .head() and .headers(). `frames` is what the request kind may serialize.
export type Cascade = {
	status: number
	frames: readonly LoaderFrame[]
	kept: readonly DataFrame[]
	failed?: Failed
}

// Outcomes are root-down. Everything below the first failed match is dropped, even when its loader
// returned data (B29): a failed layout gate must not leak a descendant's data. The status ranks every failure
// (B82). The paint slot stays the root-most failure.
export function cascade(kind: RequestKind, outcomes: readonly Outcome[]): Cascade {
	const failures = outcomes.flatMap((outcome) =>
		outcome.settled.ok
			? []
			: [{ m: outcome.id, error: outcome.settled.error, status: statusOf(outcome.settled.error) }],
	)
	const kept: DataFrame[] = []
	for (const outcome of outcomes) {
		if (!outcome.settled.ok) break
		kept.push({ t: "l", m: outcome.id, d: outcome.settled.data })
	}
	if (failures.length === 0) return { status: 200, frames: kept, kept }
	return failAt(kind, kept, failures)
}

type Failure = { m: string; error: unknown; status: number }

function failAt(kind: RequestKind, kept: readonly DataFrame[], failures: readonly Failure[]): Cascade {
	const status = rankStatus(failures.map((failure) => failure.status))
	const ranked = defined(
		failures.find((failure) => failure.status === status),
		"the ranked failure",
	)
	const at = { m: defined(failures[0], "the root-most failure").m, error: ranked.error }
	const failed = { ...at, status, boundary: boundaryKind(status) }
	// A named status keeps the frames above it on a data answer too, so the client paints the layouts over the failure
	// with their own data for this URL (plan 21 12.5, B132).
	if (kind === "document" || status !== 500) return { status, frames: kept, kept, failed }
	return { status: 200, frames: [...kept, { t: "e", m: at.m, e: at.error }], kept, failed }
}
