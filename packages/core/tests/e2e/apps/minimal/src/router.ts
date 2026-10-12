import { createRouter } from "@lovrozagar/flare";
import home from "./routes/_root_/home.page.tsx";
import root from "./routes/_root_/root.root-layout.tsx";

export const router = createRouter({
	layouts: { _root_: root },
	routeTree: [{ id: "_root_", path: "/", module: home }],
});
