import { createRouter } from "flare/router"
import type { LocationRewrite } from "flare/rewrite"
import { layouts, routeTree } from "./_gen/routes.gen"
import { getQueryClient } from "./query-client"

const vanityRewrite: LocationRewrite = {
	input: ({ url }) => {
		if (url.pathname === "/vanity") {
			const next = new URL(url)
			next.pathname = "/about"
			return next
		}
		if (url.pathname === "/alt-target") {
			const next = new URL(url)
			next.pathname = "/rewrite-target"
			return next
		}
		if (url.pathname === "/rw-with-search") {
			const next = new URL(url)
			next.pathname = "/rewrite-target"
			return next
		}
		return undefined
	},
	output: ({ url }) => {
		if (url.pathname === "/rewrite-target") {
			const next = new URL(url)
			next.pathname = "/alt-target"
			return next
		}
		return undefined
	},
}

export const localeConfig = {
	defaultLocale: "en",
	locales: ["en", "hr", "fr"] as const,
	paramName: "locale",
}

export const router = createRouter({
	cache: {
		client: { prefetch: "intent", staleTime: 60_000 },
	},
	direction: { defaultDir: "ltr" },
	layouts,
	locale: localeConfig,
	queryClientGetter: getQueryClient,
	rewrite: vanityRewrite,
	routeTree,
	theme: { defaultTheme: "system" },
	viewTransitions: true,
})
