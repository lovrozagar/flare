import { parseRichText } from "./jsx.tsx";
import { formatMessage } from "./message-format.ts";

export { parseRichText } from "./jsx.tsx";
export { formatMessage } from "./message-format.ts";

/* ── createTranslations ────────────────────────────────────────────── */

type TranslationDict = Record<string, string>;

/**
 * Static import: () => import("./en/common.json")  → { default: T }
 * Dynamic fetch: () => fetchTranslations("en", "common") → T directly
 */
type TranslationLoader<T extends TranslationDict = TranslationDict> =
	| (() => Promise<T>)
	| (() => Promise<{ default: T }>);

type TranslationNamespaces = Record<string, Record<string, TranslationLoader>>;

/**
 * Extract the resolved dict type for a namespace.
 * Unwraps both { default: D } (static import) and D (dynamic fetch).
 */
type UnwrapLoader<TLoader> = TLoader extends () => Promise<{ default: infer D }>
	? D
	: TLoader extends () => Promise<infer D>
		? D
		: TranslationDict;

type ResolvedDict<TLoaders extends Record<string, TranslationLoader>> = UnwrapLoader<TLoaders[keyof TLoaders]>;

type LoadResult<T extends TranslationNamespaces, K extends keyof T & string> = {
	[N in K]: ResolvedDict<T[N]>;
};

interface TranslationsConfig<T extends TranslationNamespaces> {
	load: <K extends keyof T & string>(locale: string, namespaces: K[]) => Promise<LoadResult<T, K>>;
}

function unwrapModule(mod: unknown): TranslationDict {
	if (
		mod !== null &&
		typeof mod === "object" &&
		"default" in (mod as Record<string, unknown>) &&
		typeof (mod as Record<string, unknown>).default === "object"
	) {
		return (mod as { default: TranslationDict }).default;
	}
	return mod as TranslationDict;
}

export function createTranslations<const T extends TranslationNamespaces>(namespaces: T): TranslationsConfig<T> {
	return {
		async load<K extends keyof T & string>(locale: string, nsKeys: K[]): Promise<LoadResult<T, K>> {
			const entries = await Promise.all(
				nsKeys.map(async (ns) => {
					const loaders = namespaces[ns];
					if (!loaders) throw new Error(`Unknown namespace: ${ns}`);
					const loader = loaders[locale];
					if (!loader) throw new Error(`Missing locale "${locale}" for namespace "${ns}"`);
					const result = await loader();
					return [ns, unwrapModule(result)] as const;
				}),
			);

			return Object.fromEntries(entries) as LoadResult<T, K>;
		},
	};
}

/* ── createTranslator ──────────────────────────────────────────────── */

type PrefixKeys<
	T extends Record<string, Record<string, string>>,
	NS extends keyof T & string,
> = `${NS}.${string & keyof T[NS]}`;

export type FlatKeys<T extends Record<string, Record<string, string>>> = [T] extends [never]
	? never
	: {
			[NS in keyof T & string]: PrefixKeys<T, NS>;
		}[keyof T & string];

/** Extract `t` property from loader data or preloader context */
export type ExtractT<TData> = TData extends {
	t: infer T extends Record<string, Record<string, string>>;
}
	? T
	: never;

/* ── ICU variable extraction (type-level) ─────────────────────────── */

type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type Alpha =
	| "A"
	| "B"
	| "C"
	| "D"
	| "E"
	| "F"
	| "G"
	| "H"
	| "I"
	| "J"
	| "K"
	| "L"
	| "M"
	| "N"
	| "O"
	| "P"
	| "Q"
	| "R"
	| "S"
	| "T"
	| "U"
	| "V"
	| "W"
	| "X"
	| "Y"
	| "Z"
	| "a"
	| "b"
	| "c"
	| "d"
	| "e"
	| "f"
	| "g"
	| "h"
	| "i"
	| "j"
	| "k"
	| "l"
	| "m"
	| "n"
	| "o"
	| "p"
	| "q"
	| "r"
	| "s"
	| "t"
	| "u"
	| "v"
	| "w"
	| "x"
	| "y"
	| "z";
type WordChar = Alpha | Digit | "_";

type EndsWithWordChar<S extends string> = S extends `${string}${WordChar}` ? true : false;

type IsIdent<S extends string> = S extends `${Alpha | "_"}${string}`
	? S extends `${string} ${string}`
		? false
		: true
	: false;

/**
 * Extract ICU variable names from a template string at the type level.
 * Handles `{var}`, `{var, plural, ...}`, `{var, select, ...}`, `{var, number}`.
 * Filters out branch content (e.g. `one{# item}`) by checking if `{` is
 * preceded by a word character (ICU branch syntax, not a variable reference).
 */
export type ExtractICUVars<S extends string> = S extends `${infer Before}{${infer After}`
	?
			| (EndsWithWordChar<Before> extends true
					? never
					: After extends `${infer Word},${string}`
						? Word extends `${infer Clean}}${string}`
							? IsIdent<Clean> extends true
								? Clean
								: never
							: IsIdent<Word> extends true
								? Word
								: never
						: After extends `${infer Word}}${string}`
							? IsIdent<Word> extends true
								? Word
								: never
							: never)
			| ExtractICUVars<After>
	: never;

/** Resolve flat key `"ns.key"` back to the template string type */
type LookupTemplate<
	TDict extends Record<string, Record<string, string>>,
	K extends string,
> = K extends `${infer NS}.${infer Key}`
	? NS extends keyof TDict
		? Key extends keyof TDict[NS]
			? TDict[NS][Key]
			: string
		: string
	: string;

/** Required typed values when template has ICU vars, optional otherwise */
type TranslatorArgs<Template extends string> = [ExtractICUVars<Template>] extends [never]
	? [values?: Record<string, unknown>]
	: [values: { [K in ExtractICUVars<Template>]: number | string }];

export interface Translator<
	TDict extends Record<string, Record<string, string>> = Record<string, Record<string, string>>,
> {
	<K extends FlatKeys<TDict>>(key: K, ...args: TranslatorArgs<LookupTemplate<TDict, K>>): string;
	rich: <K extends FlatKeys<TDict>>(
		key: K,
		components: Record<string, (children: string) => unknown>,
		...args: TranslatorArgs<LookupTemplate<TDict, K>>
	) => unknown;
}

export function createTranslator<T extends Record<string, Record<string, string>>>(
	loaded: T,
	locale?: string,
): Translator<T> {
	/* Flatten: { ns: { "key": "val" } } → { "ns.key": "val" } */
	const flat: Record<string, string> = {};
	for (const [ns, entries] of Object.entries(loaded)) {
		for (const [key, val] of Object.entries(entries)) {
			flat[`${ns}.${key}`] = val;
		}
	}

	const t = (key: string, values?: Record<string, unknown>): string => {
		const template = flat[key];
		if (template === undefined) return key;
		return formatMessage(template, values, locale);
	};

	t.rich = (
		key: string,
		components: Record<string, (children: string) => unknown>,
		values?: Record<string, unknown>,
	): unknown => {
		const template = flat[key];
		if (template === undefined) return key;

		/* First apply ICU formatting if values provided */
		const formatted = values ? formatMessage(template, values, locale) : template;

		/* Then parse rich text components */
		const parts = parseRichText(formatted, components);

		/* If single element, return it directly */
		if (parts.length === 1) return parts[0];
		return parts;
	};

	return t as Translator<T>;
}
