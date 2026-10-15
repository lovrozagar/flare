import type { BoundaryRecord } from "./boundaries.ts"
import { createChain, typedSteps, type Chain, type ChainRecord } from "./chain.ts"
import type { InitialState, RouteBuilder, RouteState } from "./route-types.ts"

export type RouteRecord = ChainRecord & {
	id: string
	document: boolean
	boundaries?: BoundaryRecord
}

export type PageBuilder<S extends RouteState> = RouteBuilder<S, "page">

// The route id is a literal type, so the page's params, parents, and auth come from it (dx/types.md).
export function createPage<Id extends string>(id: Id): PageBuilder<InitialState<Id, false>> {
	return pageBuilder(id, createChain(id))
}

// Only a page intercepts, and a .response() chain has no render, so response ends it (03-surface).
function pageBuilder<S extends RouteState>(id: string, chain: Chain): PageBuilder<S> {
	const record = (): RouteRecord & { readonly _type: "page" } => ({
		_type: "page",
		id,
		document: false,
		...chain.record(),
	})
	return {
		...typedSteps<S, "page">(chain, () => pageBuilder(id, chain), record),
		intercept(config) {
			chain.intercept(config)
			return pageBuilder(id, chain)
		},
		response(fn) {
			chain.response(fn)
			return record()
		},
	}
}
