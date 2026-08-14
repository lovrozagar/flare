import { createRouter } from "flare/router"
import { layouts, routeTree } from "./_gen/routes.gen"

export const localeConfig = {
	defaultLocale: "en",
	locales: ["en", "hr", "fr"] as const,
	paramName: "locale",
}

export const router = createRouter({
	cache: {
		client: { prefetch: "viewport", prefetchGcTime: 60_000, staleTime: 60_000 },
	},
	layouts,
	locale: localeConfig,
	routeTree,
	theme: { defaultTheme: "system" },
})
