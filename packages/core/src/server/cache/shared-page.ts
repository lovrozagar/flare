import type { Loaded, Policy, Prepared } from "../lifecycle/answers.ts"
import type { Exchange } from "../lifecycle/exchange.ts"
import { INCOMPLETE, sharedRender, type SharedRender } from "./scrub.ts"
import { storedPage, type EntryInput, type StoredPage } from "./write.ts"

// What a stored entry is built from: the shared render with its status, headers, security set, render mode, and tags.
export function entryInput(shared: SharedRender, at: { mode: "isr" | "ssr" | "ssg"; policy: Policy }): EntryInput {
	return {
		...shared,
		status: shared.run.response.status,
		headers: shared.run.headers,
		security: shared.run.security,
		render: at.mode,
		tags: at.policy.tags.store,
	}
}

// A public page no store answers renders as the anonymous request, exactly as a stored miss does, so the copy a CDN
// keeps never carries the visitor who asked first: no cookie, no search, no session (plan 21 4.4). It is served as a
// miss would be and written nowhere. A render with nothing to serve is undefined, and the page renders live; one that
// did not complete is INCOMPLETE, and the live render is private.
export async function sharedPage(
	exchange: Exchange,
	matched: Loaded,
	prepared: Prepared,
): Promise<{ page: StoredPage; policy: Policy; cookies: string[] } | typeof INCOMPLETE | undefined> {
	const shared = await sharedRender(exchange, matched)
	if (shared === undefined || shared === INCOMPLETE) return shared
	const cache = matched.chain.at(-1)?.module.cache
	const mode = cache?.isr === undefined ? (cache?.ssg === undefined ? "ssr" : "ssg") : "isr"
	const policy: Policy = { ...prepared.policy, rejected: !shared.settled }
	const page = storedPage(entryInput(shared, { mode, policy }))
	return { page, policy, cookies: [shared.run.headers["set-cookie"] ?? []].flat() }
}
