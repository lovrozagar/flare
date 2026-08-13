import { createRouter } from "flare/router"
import { layouts, routeTree } from "./_gen/routes.gen"
import { localeConfig } from "./i18n/config"

export const router = createRouter({
	cache: {
		client: { prefetch: "viewport", prefetchGcTime: 60_000, staleTime: 60_000 },
	},
	layouts,
	locale: localeConfig,
	routeTree,
	viewTransitions: true,
})
