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

export interface RootLayoutBuilder<T extends RouteTypes = {}> extends Steps<RootLayoutBuilder<T>> {
	input: <I extends RouteInput>(config: I) => RootLayoutBuilder<T & InputTypes<I>>;
	loader: <L extends LoaderData>(
		fn: (ctx: LoaderContext) => L | Promise<L>,
	) => RootLayoutBuilder<T & { loaderData: L }>;
	render: (render: NonNullable<ChainRecord["render"]>) => Bounded<RouteRecord & Typed<T>>;
}

export function createRootLayout(id: string): RootLayoutBuilder {
	return rootLayoutBuilder(id, createChain(id));
}

// One builder per step over the same chain, so a typed step returns a builder of the new type without a cast.
function rootLayoutBuilder<T extends RouteTypes>(id: string, chain: Chain): RootLayoutBuilder<T> {
	const builder: RootLayoutBuilder<T> = {
		...chainSteps(chain, () => builder),
		input<I extends RouteInput>(config: I) {
			chain.input(config);
			return rootLayoutBuilder<T & InputTypes<I>>(id, chain);
		},
		loader<L extends LoaderData>(fn: (ctx: LoaderContext) => L | Promise<L>) {
			chain.loader(fn);
			return rootLayoutBuilder<T & { loaderData: L }>(id, chain);
		},
		render(render) {
			chain.render(render);
			return withBoundaries<RouteRecord & Typed<T>>({ id, document: true, ...chain.record() });
		},
	};
	return builder;
}
