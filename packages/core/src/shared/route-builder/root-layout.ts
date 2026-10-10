import { createChain } from "./chain.ts";
import type { RouteRecord } from "./page.ts";

type Handler = () => unknown;

export type RootLayoutBuilder = {
	render: (render: Handler) => RouteRecord;
};

export function createRootLayout(id: string): RootLayoutBuilder {
	const chain = createChain(id);
	return {
		render(render) {
			chain.render(render);
			return { id, render, document: true };
		},
	};
}
