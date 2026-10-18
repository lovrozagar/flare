import { withCookies, type Decision } from "../cacheability/index.ts"
import type { LoaderRun } from "../loaders/run.ts"
import { isPublic } from "./policies.ts"

// A rendered page's cache policy: the decision, the params it keys on, and whether a deferred value rejected.
export type Policy = { decision: Decision; params: Record<string, string | string[]>; rejected?: boolean }

// A public answer, document or data, waits for every deferred value it started, whatever documentResponseDefer
// says, so a CDN copy holds no hole and no deferred error. A rejection, or a policy already rejected (a live render
// standing in for a shared one), leaves `private, no-store` (dx/cache.md). "buffer" holds any document the same way.
// Solid then writes the settled values in the shell (B92), a rejected one as its failure, which the nearest <Errored>
// paints as in a streamed document (BUGS.md 373, 374). Any other answer streams.
export async function awaited(run: LoaderRun, policy: Policy, buffer: boolean): Promise<Policy> {
	const route = [run.headers["set-cookie"] ?? []].flat()
	if (!buffer && !isPublic(withCookies(policy.decision, { route, all: route }))) return policy
	const results = await Promise.allSettled(run.deferred.map((entry) => entry.promise))
	return results.some((result) => result.status === "rejected") ? { ...policy, rejected: true } : policy
}
