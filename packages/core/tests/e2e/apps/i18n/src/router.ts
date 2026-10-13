import { createRouter } from "@lovrozagar/flare";
import { chunks, layouts, routeTree } from "./_gen/routes.gen.ts";

// The locale config both graphs import: the router's, and the server spreads it into i18n() (dx/features.md i18n).
// `ar` is the Arabic-script locale the rtl row switches to.
export const localeConfig = { locales: ["en", "hr", "ar"], defaultLocale: "en" };

export const router = createRouter({ layouts, routeTree, chunks, theme: {}, direction: {}, locale: localeConfig });
