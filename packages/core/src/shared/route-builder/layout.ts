import { createChain, typedSteps, type Chain } from "./chain.ts"
import type { RouteRecord } from "./page.ts"
import type { InitialState, RouteBuilder, RouteState, SeedGone } from "./route-types.ts"

export type LayoutBuilder<S extends RouteState> = RouteBuilder<S, "layout">

export function createLayout<Id extends string>(id: Id): RouteBuilder<InitialState<Id, false>, "layout", SeedGone<Id>> {
	return layoutBuilder<InitialState<Id, false>, SeedGone<Id>>(id, createChain(id))
}

function layoutBuilder<S extends RouteState, G extends string = never>(
	id: string,
	chain: Chain,
): RouteBuilder<S, "layout", G> {
	const record = (): RouteRecord & { readonly _type: "layout" } => ({
		_type: "layout",
		id,
		document: false,
		...chain.record(),
	})
	return typedSteps<S, "layout", G>(chain, () => layoutBuilder(id, chain), record)
}
