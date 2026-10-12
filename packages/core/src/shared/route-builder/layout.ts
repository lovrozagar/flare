import { createChain, typedSteps, type Chain } from "./chain.ts";
import type { RouteRecord } from "./page.ts";
import type { InitialState, RouteBuilder, RouteState } from "./route-types.ts";

export type LayoutBuilder<S extends RouteState> = RouteBuilder<S, "layout">;

export function createLayout<Id extends string>(id: Id): LayoutBuilder<InitialState<Id, false>> {
	return layoutBuilder(id, createChain(id));
}

function layoutBuilder<S extends RouteState>(id: string, chain: Chain): LayoutBuilder<S> {
	const record = (): RouteRecord & { readonly _type: "layout" } => ({
		_type: "layout",
		id,
		document: false,
		...chain.record(),
	});
	return typedSteps<S, "layout">(chain, () => layoutBuilder(id, chain), record);
}
