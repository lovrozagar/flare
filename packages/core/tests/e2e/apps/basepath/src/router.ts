import { createRouter } from "@lovrozagar/flare";

export const router = createRouter({
	basePath: "/app",
	layouts: { _root_: {} },
	routeTree: [{ id: "_root_", path: "/", module: {} }],
});
