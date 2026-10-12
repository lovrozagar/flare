import { createRouter } from "@lovrozagar/flare";
import { route as about } from "./routes/_root_/about.page.tsx";
import { route as echo } from "./routes/_root_/echo.page.tsx";
import { route as home } from "./routes/_root_/home.page.tsx";
import { route as root } from "./routes/_root_/root.root-layout.tsx";
import { route as skeletons } from "./routes/_root_/skeletons.page.tsx";
import { route as stored } from "./routes/_root_/stored.page.tsx";
import { route as styled } from "./routes/_root_/styled.page.tsx";

export const router = createRouter({
	layouts: { _root_: root },
	routeTree: [
		{ id: "_root_/", path: "/", module: home },
		{ id: "_root_/about", path: "/about", module: about },
		{ id: "_root_/echo", path: "/echo", module: echo },
		{ id: "_root_/skeletons", path: "/skeletons", module: skeletons },
		{ id: "_root_/stored", path: "/stored", module: stored },
		{ id: "_root_/styled", path: "/styled", module: styled },
	],
});
