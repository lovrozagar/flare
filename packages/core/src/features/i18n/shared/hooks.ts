import { useLocaleState, type LocaleState } from "./provider.tsx";

// `{ locale, locales, defaultLocale, setLocale }`. `locale` is an accessor. `setLocale` navigates to the tag on the
// current route, and once that commits writes the cookie and tells other tabs (dx/features.md i18n).
export function useLocale(): LocaleState {
	return useLocaleState();
}
