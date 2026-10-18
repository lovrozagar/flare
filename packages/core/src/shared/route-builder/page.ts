import type { BoundaryRecord } from "./boundaries.ts"
import { createChain, typedSteps, type Chain, type ChainRecord } from "./chain.ts"
import type { BuilderSteps, InitialState, PageSteps, RouteBuilder, RouteState, SeedGone } from "./route-types.ts"

export type RouteRecord = ChainRecord & {
	id: string
	document: boolean
	boundaries?: BoundaryRecord
}

export type PageBuilder<S extends RouteState> = RouteBuilder<S, "page">

// The route id is a literal type, so the page's params, parents, and auth come from it (dx/types.md).
export function createPage<Id extends string>(id: Id): RouteBuilder<InitialState<Id, false>, "page", SeedGone<Id>> {
	return pageBuilder<InitialState<Id, false>, SeedGone<Id>>(id, createChain(id))
}

// Only a page intercepts, and a .response() chain has no render, so response ends it (03-surface).
function pageBuilder<S extends RouteState, G extends string = never>(
	id: string,
	chain: Chain,
): RouteBuilder<S, "page", G> {
	const record = (): RouteRecord & { readonly _type: "page" } => ({
		_type: "page",
		id,
		document: false,
		...chain.record(),
	})
	// Every step a page has: the builder's type leaves out the ones gone in `G`.
	const steps: BuilderSteps<S, "page", G> & PageSteps<S, G> = {
		...typedSteps<S, "page", G>(chain, () => pageBuilder(id, chain), record),
		intercept(config) {
			chain.intercept(config)
			return pageBuilder<S, G | "intercept">(id, chain)
		},
		response(fn, options) {
			chain.response(fn, options)
			return record()
		},
	}
	return steps
}
