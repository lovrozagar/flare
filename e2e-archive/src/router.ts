import { createRouter } from "flare/router"
import type { LocationRewrite } from "flare/rewrite"
import { layouts, routeTree } from "./_gen/routes.gen"
import { getQueryClient } from "./query-client"

/**
 * E2E rewrites for testing:
 * - `/vanity` → `/about` (input only, no output — one-way vanity URL)
 * - `/alt-target` ↔ `/rewrite-target` (bidirectional — tests output rewrite on links)
 * - `/rw-with-search` → `/rewrite-target` (preserves search params through rewrite)
 */
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

export const router = createRouter({
	direction: { defaultDir: "ltr" },
	layouts,
	locale: {
		defaultLocale: "en",
		locales: ["en", "hr", "fr"],
		paramName: "locale",
	},
	queryClientGetter: getQueryClient,
	rewrite: vanityRewrite,
	routeTree,
	theme: { defaultTheme: "system" },
	viewTransitions: true,
})
