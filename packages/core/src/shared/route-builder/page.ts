import { withBoundaries, type Bounded, type BoundaryRecord } from "./boundaries.ts";
import {
	chainSteps,
	createChain,
	type Chain,
	type ChainRecord,
	type Intercept,
	type LoaderContext,
	type LoaderData,
	type RouteInput,
	type Steps,
} from "./chain.ts";
import type { InputTypes, RouteTypes, Typed } from "./types.ts";

export type RouteRecord = ChainRecord & {
	id: string;
	document: boolean;
	boundaries?: BoundaryRecord;
};

// Only a page intercepts. It is the first step (03-surface).
export interface PageBuilder<T extends RouteTypes = {}> extends Steps<PageBuilder<T>> {
	input: <I extends RouteInput>(config: I) => PageBuilder<T & InputTypes<I>>;
	loader: <L extends LoaderData>(fn: (ctx: LoaderContext) => L | Promise<L>) => PageBuilder<T & { loaderData: L }>;
	intercept: (config: Intercept) => PageBuilder<T>;
	response: (fn: NonNullable<ChainRecord["response"]>) => RouteRecord & Typed<T>;
	render: (render: NonNullable<ChainRecord["render"]>) => Bounded<RouteRecord & Typed<T>>;
}

export function createPage(id: string): PageBuilder {
	return pageBuilder(id, createChain(id));
}

// One builder per step over the same chain, so a typed step returns a builder of the new type without a cast.
function pageBuilder<T extends RouteTypes>(id: string, chain: Chain): PageBuilder<T> {
	// A .response() chain has no render, so response ends the chain.
	const builder: PageBuilder<T> = {
		...chainSteps(chain, () => builder),
		input<I extends RouteInput>(config: I) {
			chain.input(config);
			return pageBuilder<T & InputTypes<I>>(id, chain);
		},
		loader<L extends LoaderData>(fn: (ctx: LoaderContext) => L | Promise<L>) {
			chain.loader(fn);
			return pageBuilder<T & { loaderData: L }>(id, chain);
		},
		intercept(config) {
			chain.intercept(config);
			return builder;
		},
		response(fn) {
			chain.response(fn);
			return { id, document: false, ...chain.record() };
		},
		render(render) {
			chain.render(render);
			return withBoundaries<RouteRecord & Typed<T>>({ id, document: false, ...chain.record() });
		},
	};
	return builder;
}
