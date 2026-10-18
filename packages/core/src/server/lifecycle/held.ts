import { defined } from "../../shared/errors/defined.ts"
import { withCookies, type Decision } from "../cacheability/index.ts"
import type { LoaderRun } from "../loaders/run.ts"
import { isPublic } from "./policies.ts"

// A rendered page's cache policy: the decision, the params it keys on, and whether a deferred value rejected.
export type Policy = { decision: Decision; params: Record<string, string | string[]>; rejected?: boolean }

// A public answer, document or data, waits for every deferred value it started, whatever documentResponseDefer
// says, so a CDN copy holds no hole and no deferred error. A rejection, or a policy already rejected (a live render
// standing in for a shared one), leaves `private, no-store` (dx/cache.md). "buffer" holds any document the same way.
// Solid then writes the settled values in the shell (B92). Any other answer streams.
export async function awaited(
	run: LoaderRun,
	policy: Policy,
	buffer: boolean,
): Promise<{ policy: Policy; rejected?: { m: string; error: unknown } }> {
	const route = [run.headers["set-cookie"] ?? []].flat()
	if (!buffer && !isPublic(withCookies(policy.decision, { route, all: route }))) return { policy }
	const results = await Promise.allSettled(run.deferred.map((entry) => entry.promise))
	const [first] = results.flatMap((result, index) =>
		result.status === "rejected" ? [{ index, error: result.reason }] : [],
	)
	if (first === undefined) return { policy }
	const entry = defined(run.deferred[first.index], "the rejected defer")
	return { policy: { ...policy, rejected: true }, rejected: { m: entry.m, error: first.error } }
}

// A held document has no place for a value that rejected: Solid writes nothing there, and the client cannot hydrate
// it. So the rejection is the document error (dx/defer.md): the match that deferred it fails as a throwing loader
// does, at 500 with the walked errorRender, and the matches below it do not render (BUGS.md 370).
export function rejectedRun(
	run: LoaderRun,
	chain: readonly { id: string }[],
	rejected: { m: string; error: unknown },
): LoaderRun {
	const index = chain.findIndex((entry) => entry.id === rejected.m)
	const above = (m: string): boolean => chain.findIndex((entry) => entry.id === m) < index
	return {
		...run,
		response: new Response(null, { status: 500 }),
		data: run.data.slice(0, index),
		heads: run.heads.slice(0, index),
		contexts: run.contexts.slice(0, index),
		failed: { m: rejected.m, status: 500, boundary: "errorRender", error: rejected.error },
		deferred: run.deferred.filter((entry) => above(entry.m)),
	}
}
