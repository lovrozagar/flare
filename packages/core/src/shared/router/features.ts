// The feature configs createRouter stores on the router object, where ThemeScript, DirectionScript, and their
// providers read them (dx/router.md). Each is absent unless the app passes it.

export type ThemeName = "light" | "dark" | "system"
type DataAttribute = `data-${string}`

export type ThemeOptions = {
	defaultTheme?: ThemeName
	attribute?: DataAttribute
	storageKey?: string
	themes?: readonly ThemeName[]
	disableTransitionOnChange?: boolean
}

export type ThemeConfig = {
	defaultTheme: ThemeName
	attribute: string
	storageKey: string
	themes: readonly ThemeName[]
	disableTransitionOnChange: boolean
}

export type Dir = "ltr" | "rtl"

export type DirectionOptions = {
	defaultDir?: Dir
	attribute?: "dir" | DataAttribute
	storageKey?: string
}

export type DirectionConfig = { defaultDir: Dir; attribute: string; storageKey: string }

export type LocaleOptions = {
	locales: readonly string[]
	defaultLocale: string
	paramName?: string
	cookieName?: string
}

export type LocaleConfig = { locales: readonly string[]; defaultLocale: string; paramName: string; cookieName: string }

const THEMES: readonly ThemeName[] = ["light", "dark", "system"]
const DIRS: readonly string[] = ["ltr", "rtl"]

// A lowercase data attribute with a name after the prefix. `class`, `style`, `id`, and `dir` are not one.
const DATA_ATTRIBUTE = /^data-[a-z0-9]+(?:-[a-z0-9]+)*$/

export function themeConfig(options: ThemeOptions): ThemeConfig {
	const themes = options.themes ?? THEMES
	const known = themes.every((theme) => THEMES.includes(theme))
	if (themes.length === 0 || !known || new Set(themes).size !== themes.length) throw new Error("theme.themes")
	const defaultTheme = options.defaultTheme ?? "system"
	if (!themes.includes(defaultTheme)) throw new Error("theme.defaultTheme")
	const attribute = options.attribute ?? "data-theme"
	if (!DATA_ATTRIBUTE.test(attribute)) throw new Error("theme.attribute")
	return {
		defaultTheme,
		attribute,
		storageKey: storageKey(options.storageKey ?? "flare.theme", "theme"),
		themes,
		disableTransitionOnChange: options.disableTransitionOnChange ?? true,
	}
}

export function directionConfig(options: DirectionOptions): DirectionConfig {
	const defaultDir = options.defaultDir ?? "ltr"
	if (!DIRS.includes(defaultDir)) throw new Error("direction.defaultDir")
	const attribute = options.attribute ?? "dir"
	if (attribute !== "dir" && !DATA_ATTRIBUTE.test(attribute)) throw new Error("direction.attribute")
	return { defaultDir, attribute, storageKey: storageKey(options.storageKey ?? "flare.dir", "direction") }
}

// A cookie name is an RFC 6265 token.
export const COOKIE_TOKEN: RegExp = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

// `locales` is non-empty, unique, and canonical BCP 47 (`en-US`, not `en-us`), and holds `defaultLocale`. The cookie
// name defaults to the server's, so setLocale and i18n() write the same cookie, and is a token, since Set-Cookie
// carries it as written (BUGS.md 279).
export function localeConfig(options: LocaleOptions): LocaleConfig {
	const { locales, defaultLocale } = options
	if (locales.length === 0 || new Set(locales).size !== locales.length) throw new Error("locale.locales")
	for (const tag of locales) if (canonical(tag) !== tag) throw new Error(`locale.locales ${tag}`)
	if (!locales.includes(defaultLocale)) throw new Error("locale.defaultLocale")
	const cookieName = options.cookieName ?? "flare.locale"
	if (!COOKIE_TOKEN.test(cookieName)) throw new Error("locale.cookieName")
	return { locales, defaultLocale, paramName: options.paramName ?? "locale", cookieName }
}

// A segment `Intl` accepts as a language tag (B73).
export function localeLike(segment: string): boolean {
	return canonical(segment) !== undefined
}

// With a locale config, the `paramName` param holds only a configured tag, in any case, so the wrong case can 301 to
// its spelling. Any other segment, `pricing` or an unconfigured tag, is an ordinary path segment (B73, plan 21 3.8).
export function localeParam(config: LocaleConfig): (name: string, value: string) => boolean {
	const tags = new Set(config.locales.map((tag) => tag.toLowerCase()))
	return (name, value) => name !== config.paramName || tags.has(value.toLowerCase())
}

// The canonical spelling of a tag, or nothing when `Intl` rejects it.
function canonical(tag: string): string | undefined {
	try {
		return Intl.getCanonicalLocales(tag)[0]
	} catch {
		return undefined
	}
}

function storageKey(key: string, feature: string): string {
	if (key === "") throw new Error(`${feature}.storageKey`)
	return key
}
