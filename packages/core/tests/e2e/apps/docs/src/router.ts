import { createRouter } from "@lovrozagar/flare";
import { chunks, layouts, routeTree } from "./_gen/routes.gen.ts";
import { localeConfig } from "./locale-config.ts";
import "./query.ts";

export { localeConfig };

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
