import { createChain } from "./chain.ts";
import type { RouteRecord } from "./page.ts";

type Handler = () => unknown;

export type LayoutBuilder = {
	render: (render: Handler) => RouteRecord;
};

export function createLayout(id: string): LayoutBuilder {
	const chain = createChain(id);
	return {
		render(render) {
			chain.render(render);
			return { id, render, document: false };
		},
	};
}
