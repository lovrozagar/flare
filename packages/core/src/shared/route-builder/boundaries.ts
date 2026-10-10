type Handler = () => unknown;

export type Boundaries = {
	errorRender: (render: Handler) => Boundaries;
};

export function createBoundaries(): Boundaries {
	const used = new Set<string>();
	const api: Boundaries = {
		errorRender(render) {
			void render;
			if (used.has("errorRender")) throw new Error("errorRender twice");
			used.add("errorRender");
			return api;
		},
	};
	return api;
}
