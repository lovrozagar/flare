import { chainSteps, createChain, type ChainRecord, type Steps } from "./chain.ts";

export type RouteRecord = ChainRecord & {
	id: string;
	document: boolean;
};

export interface PageBuilder extends Steps<PageBuilder> {
	response: (fn: NonNullable<ChainRecord["response"]>) => RouteRecord;
	render: (render: NonNullable<ChainRecord["render"]>) => RouteRecord;
}

export function createPage(id: string): PageBuilder {
	const chain = createChain(id);
	// A .response() chain has no render, so response ends the chain.
	const builder: PageBuilder = {
		...chainSteps(chain, () => builder),
		response(fn) {
			chain.response(fn);
			return { id, document: false, ...chain.record() };
		},
		render(render) {
			chain.render(render);
			return { id, document: false, ...chain.record() };
		},
	};
	return builder;
}
