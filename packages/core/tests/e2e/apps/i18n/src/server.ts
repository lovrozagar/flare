import { createMemoryStore, createServer } from "@lovrozagar/flare/server";
import { i18n } from "@lovrozagar/flare/i18n/server";
import { localeConfig, router } from "./router.ts";

// The home page is a shared render, so the server has a store and `site`, an https placeholder a shared render never
// fetches. The locale slot runs before middleware.
export const server = createServer({
	router,
	site: "https://flare.test",
	store: createMemoryStore(),
	locale: i18n(localeConfig),
});
