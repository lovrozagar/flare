import { createChain, typedSteps, type Chain } from "./chain.ts"
import type { RouteRecord } from "./page.ts"
import type { AncestorState, RouteBuilder, RouteState } from "./route-types.ts"

export type RootLayoutBuilder<S extends RouteState> = RouteBuilder<S, "root">

export function createRootLayout<Id extends string>(id: Id): RootLayoutBuilder<AncestorState<Id, true>> {
	return rootLayoutBuilder<AncestorState<Id, true>>(id, createChain(id))
}

function rootLayoutBuilder<S extends RouteState>(id: string, chain: Chain): RootLayoutBuilder<S> {
	const record = (): RouteRecord & { readonly _type: "root" } => ({
		_type: "root",
		id,
		document: true,
		...chain.record(),
	})
	return typedSteps<S, "root">(chain, () => rootLayoutBuilder(id, chain), record)
}
