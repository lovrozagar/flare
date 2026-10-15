import { createServerOnlyFn } from "@lovrozagar/flare"
import { serverCtx, withFetchDedupe } from "@lovrozagar/flare/server"

export type Stats = { stars: number; contributors: number }

// The project stats the docs layout and each doc page read. `withFetchDedupe` makes the second identical read in one
// request reuse the first, so the upstream counts one call. Server-only: a route chunk keeps every export, so a
// helper that reaches server code lives here, not in a route file.
export const readStats = createServerOnlyFn(async (): Promise<{ stats: Stats; calls: number }> => {
	const upstream = serverCtx().upstream
	const response = await withFetchDedupe(upstream)("https://upstream.flare.test/stats")
	return { stats: (await response.json()) as Stats, calls: upstream.calls() }
})
