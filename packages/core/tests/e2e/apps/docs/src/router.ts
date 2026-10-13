import { createRouter } from "@lovrozagar/flare";
import { chunks, layouts, routeTree } from "./_gen/routes.gen.ts";
import "./query.ts";

// The locale config both graphs import: the router's, and the server spreads it into i18n(). `ar` is the
// Arabic-script locale that turns the page right to left.
export const localeConfig = { locales: ["en", "hr", "ar"], defaultLocale: "en" };

// `/guide/<slug>` is an alias the client resolves before match, so an in-app link to it is a client navigation.
export const router = createRouter({
	layouts,
	routeTree,
	chunks,
	notFoundMode: "fuzzy",
	viewTransitions: true,
	prefetch: { modules: "all", data: false },
	theme: { disableTransitionOnChange: true },
	direction: {},
	locale: localeConfig,
	rewrite(location) {
		if (!location.pathname.startsWith("/guide/")) return undefined;
		return { ...location, pathname: `/docs/${location.pathname.slice("/guide/".length)}` };
	},
});
