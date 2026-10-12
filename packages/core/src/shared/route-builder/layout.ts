import { withBoundaries, type Bounded } from "./boundaries.ts";
import {
	chainSteps,
	createChain,
	type Chain,
	type ChainRecord,
	type LoaderContext,
	type LoaderData,
	type RouteInput,
	type Steps,
} from "./chain.ts";
import type { RouteRecord } from "./page.ts";
import type { InputTypes, RouteTypes, Typed } from "./types.ts";

export interface LayoutBuilder<T extends RouteTypes = {}> extends Steps<LayoutBuilder<T>> {
	input: <I extends RouteInput>(config: I) => LayoutBuilder<T & InputTypes<I>>;
	loader: <L extends LoaderData>(fn: (ctx: LoaderContext) => L | Promise<L>) => LayoutBuilder<T & { loaderData: L }>;
	render: (render: NonNullable<ChainRecord["render"]>) => Bounded<RouteRecord & Typed<T>>;
}

export function createLayout(id: string): LayoutBuilder {
	return layoutBuilder(id, createChain(id));
}

// One builder per step over the same chain, so a typed step returns a builder of the new type without a cast.
function layoutBuilder<T extends RouteTypes>(id: string, chain: Chain): LayoutBuilder<T> {
	const builder: LayoutBuilder<T> = {
		...chainSteps(chain, () => builder),
		input<I extends RouteInput>(config: I) {
			chain.input(config);
			return layoutBuilder<T & InputTypes<I>>(id, chain);
		},
		loader<L extends LoaderData>(fn: (ctx: LoaderContext) => L | Promise<L>) {
			chain.loader(fn);
			return layoutBuilder<T & { loaderData: L }>(id, chain);
		},
		render(render) {
			chain.render(render);
			return withBoundaries<RouteRecord & Typed<T>>({ id, document: false, ...chain.record() });
		},
	};
	return builder;
}
