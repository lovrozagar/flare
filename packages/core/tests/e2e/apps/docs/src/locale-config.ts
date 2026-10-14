// The locale config both graphs import: the router's, and the server spreads it into i18n(). `ar` is the
// Arabic-script locale that turns the page right to left. A leaf module: a route module that imported the router,
// which imports the generated routes, would close an import cycle that hands dev requests a module mid-reload after an
// edit (dx/routes.md, BUGS.md 73).
export const localeConfig = { locales: ["en", "hr", "ar"], defaultLocale: "en" };
