import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	const router = createRouter({
		defaultPreload: "intent",
		routeTree,
		scrollRestoration: true,
	});
	return router;
}
