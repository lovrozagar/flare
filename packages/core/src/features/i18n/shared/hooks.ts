import { getRequestEvent } from "@solidjs/web"
import { useLocaleState, type LocaleState } from "./provider.tsx"
import { translator, type Translate, type Translations } from "./translate.ts"

// `{ locale, locales, defaultLocale, setLocale }`. `locale` is an accessor. `setLocale` navigates to the tag on the
// current route, and once that commits writes the cookie and tells other tabs (dx/features.md i18n).
export function useLocale(): LocaleState {
	return useLocaleState()
}

// `t` for the loader running now, bound to its locale: the route's `paramName` param when it is a configured tag,
// otherwise the default. Anywhere else, a render or a server function included, it throws.
export function useLoaderT(translations: Translations): Translate {
	return boundT(translations, "loader", "useLoaderT")
}

// The same for the preloader running now.
export function usePreloaderT(translations: Translations): Translate {
	return boundT(translations, "preloader", "usePreloaderT")
}

type Scope = { params: object; locale: { locales: readonly unknown[]; defaultLocale: string; paramName: string } }

// The core runs each loader and preloader call under a child of the request event that carries `flareLoader`:
// `{ kind, params, locale }`, where `locale` is the router's config. This reads it without importing the core.
function boundT(translations: Translations, kind: "loader" | "preloader", hook: string): Translate {
	const scope = scopeOf(kind, hook)
	const name = Reflect.get(scope.params, scope.locale.paramName)
	const tag = typeof name === "string" && scope.locale.locales.includes(name) ? name : scope.locale.defaultLocale
	return translator(translations[tag], tag)
}

function scopeOf(kind: string, hook: string): Scope {
	const event: unknown = getRequestEvent()
	const scope: unknown = typeof event === "object" && event !== null ? Reflect.get(event, "flareLoader") : undefined
	if (!isObject(scope) || Reflect.get(scope, "kind") !== kind) throw new Error(`${hook} runs inside a .${kind}()`)
	const params: unknown = Reflect.get(scope, "params")
	const locale: unknown = Reflect.get(scope, "locale")
	if (!isObject(params) || !isLocale(locale)) throw new Error(`${hook} needs createRouter({ locale })`)
	return { params, locale }
}

function isObject(value: unknown): value is object {
	return typeof value === "object" && value !== null
}

function isLocale(value: unknown): value is Scope["locale"] {
	if (!isObject(value)) return false
	const read = (key: string): unknown => Reflect.get(value, key)
	return (
		Array.isArray(read("locales")) && typeof read("defaultLocale") === "string" && typeof read("paramName") === "string"
	)
}
