import { createChain } from "./chain.ts";

type Handler = () => unknown;

export type RouteRecord = {
	id: string;
	render: Handler;
	document: boolean;
};

export type PageBuilder = {
	render: (render: Handler) => RouteRecord;
};

export function createPage(id: string): PageBuilder {
	const chain = createChain(id);
	return {
		render(render) {
			chain.render(render);
			return { id, render, document: false };
		},
	};
}
