import { createRouter } from "flare"
import { layouts, routeTree } from "./_gen/routes.gen"

export const router = createRouter({
	layouts,
	routeTree,
	viewTransitions: true,
})
