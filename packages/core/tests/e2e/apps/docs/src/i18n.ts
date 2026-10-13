import { createTranslations, formatMessage, useLocale, type Translations } from "@lovrozagar/flare/i18n";

// The UI strings only. The docs prose stays English, so the site stays short.
export const messages = createTranslations({
	en: {
		hello: "Hello",
		tagline: "The server-driven Solid framework, one page per feature.",
		docs: "Docs",
		api: "API",
		examples: "Examples",
		changelog: "Changelog",
		playground: "Playground",
		search: "Search",
		results: "{count, plural, =0 {No results} one {# result} other {# results}}",
		place: "{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} release",
		role: "{role, select, admin {Administrator} other {Reader}}",
		helpful: "Was this page helpful?",
	},
	hr: {
		hello: "Bok",
		tagline: "Solid okvir vođen poslužiteljem, jedna stranica po značajci.",
		docs: "Dokumentacija",
		api: "API",
		examples: "Primjeri",
		changelog: "Promjene",
		playground: "Igralište",
		search: "Traži",
		results: "{count, plural, =0 {Nema rezultata} one {# rezultat} few {# rezultata} other {# rezultata}}",
		place: "{n}. izdanje",
		role: "{role, select, admin {Administrator} other {Čitatelj}}",
		helpful: "Je li ova stranica korisna?",
	},
	ar: {
		hello: "مرحبا",
		tagline: "إطار Solid يقوده الخادم، صفحة لكل ميزة.",
		docs: "التوثيق",
		api: "الواجهة",
		examples: "أمثلة",
		changelog: "سجل التغييرات",
		playground: "ساحة التجربة",
		search: "بحث",
		results:
			"{count, plural, zero {لا نتائج} one {نتيجة واحدة} two {نتيجتان} few {# نتائج} many {# نتيجة} other {# نتيجة}}",
		place: "الإصدار {n}",
		role: "{role, select, admin {مدير} other {قارئ}}",
		helpful: "هل كانت هذه الصفحة مفيدة؟",
	},
});

// A render-time translator bound to the current locale. Loaders use `useLoaderT(messages)` instead.
export function useUi(map: Translations = messages): (key: string, values?: Record<string, string | number>) => string {
	const locale = useLocale();
	return (key, values) => formatMessage(map[locale.locale()]?.[key] ?? key, values, locale.locale());
}
