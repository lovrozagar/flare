import { createRouter } from "@lovrozagar/flare";
import { route as home } from "./routes/_root_/home.page.tsx";
import { route as root } from "./routes/_root_/root.root-layout.tsx";

export const router = createRouter({
	basePath: "/app",
	layouts: { _root_: root },
	routeTree: [{ id: "_root_", path: "/", module: home }],
});
