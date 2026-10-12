import { withBoundaries, type Bounded } from "./boundaries.ts";
import { chainSteps, createChain, type ChainRecord, type Steps } from "./chain.ts";
import type { RouteRecord } from "./page.ts";

export interface RootLayoutBuilder extends Steps<RootLayoutBuilder> {
	render: (render: NonNullable<ChainRecord["render"]>) => Bounded<RouteRecord>;
}

export function createRootLayout(id: string): RootLayoutBuilder {
	const chain = createChain(id);
	const builder: RootLayoutBuilder = {
		...chainSteps(chain, () => builder),
		render(render) {
			chain.render(render);
			return withBoundaries<RouteRecord>({ id, document: true, ...chain.record() });
		},
	};
	return builder;
}
