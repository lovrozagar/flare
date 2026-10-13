// The feature configs createRouter stores on the router object, where ThemeScript, DirectionScript, and their
// providers read them (dx/router.md). Each is absent unless the app passes it.

export type ThemeName = "light" | "dark" | "system";
type DataAttribute = `data-${string}`;

export type ThemeOptions = {
	defaultTheme?: ThemeName;
	attribute?: DataAttribute;
	storageKey?: string;
	themes?: readonly ThemeName[];
	disableTransitionOnChange?: boolean;
};

export type ThemeConfig = {
	defaultTheme: ThemeName;
	attribute: string;
	storageKey: string;
	themes: readonly ThemeName[];
	disableTransitionOnChange: boolean;
};

export type Dir = "ltr" | "rtl";

export type DirectionOptions = {
	defaultDir?: Dir;
	attribute?: "dir" | DataAttribute;
	storageKey?: string;
};

export type DirectionConfig = { defaultDir: Dir; attribute: string; storageKey: string };

export type LocaleOptions = { locales: readonly string[]; defaultLocale: string; paramName?: string };

export type LocaleConfig = { locales: readonly string[]; defaultLocale: string; paramName: string };

const THEMES: readonly ThemeName[] = ["light", "dark", "system"];
const DIRS: readonly string[] = ["ltr", "rtl"];

// A lowercase data attribute with a name after the prefix. `class`, `style`, `id`, and `dir` are not one.
const DATA_ATTRIBUTE = /^data-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function themeConfig(options: ThemeOptions): ThemeConfig {
	const themes = options.themes ?? THEMES;
	const known = themes.every((theme) => THEMES.includes(theme));
	if (themes.length === 0 || !known || new Set(themes).size !== themes.length) throw new Error("theme.themes");
	const defaultTheme = options.defaultTheme ?? "system";
	if (!themes.includes(defaultTheme)) throw new Error("theme.defaultTheme");
	const attribute = options.attribute ?? "data-theme";
	if (!DATA_ATTRIBUTE.test(attribute)) throw new Error("theme.attribute");
	return {
		defaultTheme,
		attribute,
		storageKey: storageKey(options.storageKey ?? "flare.theme", "theme"),
		themes,
		disableTransitionOnChange: options.disableTransitionOnChange ?? true,
	};
}

export function directionConfig(options: DirectionOptions): DirectionConfig {
	const defaultDir = options.defaultDir ?? "ltr";
	if (!DIRS.includes(defaultDir)) throw new Error("direction.defaultDir");
	const attribute = options.attribute ?? "dir";
	if (attribute !== "dir" && !DATA_ATTRIBUTE.test(attribute)) throw new Error("direction.attribute");
	return { defaultDir, attribute, storageKey: storageKey(options.storageKey ?? "flare.dir", "direction") };
}

export function localeConfig(options: LocaleOptions): LocaleConfig {
	return { locales: options.locales, defaultLocale: options.defaultLocale, paramName: options.paramName ?? "locale" };
}

function storageKey(key: string, feature: string): string {
	if (key === "") throw new Error(`${feature}.storageKey`);
	return key;
}
