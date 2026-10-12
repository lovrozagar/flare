import { withBoundaries, type Bounded } from "./boundaries.ts";
import { chainSteps, createChain, type ChainRecord, type Steps } from "./chain.ts";
import type { RouteRecord } from "./page.ts";

export interface LayoutBuilder extends Steps<LayoutBuilder> {
	render: (render: NonNullable<ChainRecord["render"]>) => Bounded<RouteRecord>;
}

export function createLayout(id: string): LayoutBuilder {
	const chain = createChain(id);
	const builder: LayoutBuilder = {
		...chainSteps(chain, () => builder),
		render(render) {
			chain.render(render);
			return withBoundaries<RouteRecord>({ id, document: false, ...chain.record() });
		},
	};
	return builder;
}
