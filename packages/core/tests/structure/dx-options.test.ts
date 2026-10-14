import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSync } from "oxc-parser";
import { expect, it } from "vitest";

// The option tables of every dx file name only keys the exported types have (BUGS.md 113). Each `prop` or `key` table
// maps, by the heading above it, to a type in the source, or to a function whose parameters and last parameter's keys
// it lists; a heading with several tables maps to one source per table, in order. A table with no type behind it is an
// explicit exemption with its reason, and a table under a `Planned (plan 15)` heading documents what v1 does not ship.
// A dx file or a table with no mapping fails, so it gets one.
const core = fileURLToPath(new URL("../../", import.meta.url));
const repo = join(core, "../..");
const dx = join(repo, "blueprint/dx");

// `external` names a key the type takes from a package's type, which oxc cannot read from the source.
type Source =
	| { file: string; type: string; path?: readonly string[]; external?: { from: string; names: readonly string[] } }
	| { file: string; fn: string }
	| { exempt: string };

const TYPES = "src/shared/route-builder/types.ts";

const TABLES: Readonly<Record<string, Readonly<Record<string, Source | readonly Source[]>>>> = {
	"adapters.md": {
		Node: { file: "src/adapters/node/listener.ts", type: "NodeListenerOptions" },
		Workers: { file: "src/adapters/workers/handler.ts", fn: "createWorkersHandler" },
	},
	"builder.md": {
		effects: { file: "src/shared/route-builder/chain.ts", type: "Effects" },
		"Render props": { file: "src/shared/route-builder/route-types.ts", type: "RenderProps" },
	},
	"cache.md": {
		ssr: { file: TYPES, type: "SsrCache" },
		isr: { file: TYPES, type: "IsrCache" },
		cdn: { file: TYPES, type: "CdnCache" },
		client: { file: TYPES, type: "ClientCache" },
	},
	"defer.md": { defer: { file: "src/server/loaders/defer.ts", type: "DeferOptions" } },
	"features.md": {
		Theme: { file: "src/shared/router/features.ts", type: "ThemeOptions" },
		Direction: { file: "src/shared/router/features.ts", type: "DirectionOptions" },
		i18n: [
			{ file: "src/features/i18n/server/middleware.ts", fn: "i18n" },
			{ file: "src/features/i18n/shared/provider.tsx", type: "LocaleProviderProps" },
		],
		Image: { file: "src/features/image/shared/image.tsx", type: "ImageProps" },
		Fonts: [
			{ file: "src/features/fonts/shared/create-font.ts", type: "FontOptions" },
			{ file: "src/features/fonts/shared/font-css.tsx", type: "FontCSSProps" },
		],
	},
	"head.md": {
		SeoImage: { file: TYPES, type: "SeoImage" },
		favicons: { file: TYPES, type: "HeadConfig", path: ["favicons"] },
		robots: { file: TYPES, type: "Robots" },
		openGraph: { file: TYPES, type: "OpenGraph" },
		twitter: { file: TYPES, type: "TwitterCard" },
		meta: { file: TYPES, type: "HeadMeta" },
		custom: { file: TYPES, type: "HeadConfig", path: ["custom"] },
	},
	"link.md": {
		"Link props": {
			file: "src/shared/components/link.tsx",
			type: "LinkProps",
			external: { from: "JSX.AnchorHTMLAttributes", names: ["target", "rel"] },
		},
	},
	"navigate.md": {
		"navigate and hooks": { file: "src/shared/router/context.ts", type: "NavigateTo" },
		viewTransition: { file: "src/shared/router/create-router.ts", type: "ViewTransitionOptions" },
		ViewTransitionBoundary: {
			file: "src/shared/components/view-transition-boundary.tsx",
			fn: "ViewTransitionBoundary",
		},
		ViewTransitionCSS: { file: "src/shared/components/view-transition-css.tsx", fn: "ViewTransitionCSS" },
		useNavigationProgress: { file: "src/client/navigation/progress.ts", fn: "useNavigationProgress" },
	},
	"observability.md": {
		Observability: { exempt: "plan 15: v1 ships no logger, error reporter, request log, or tracer (B98, B99)" },
	},
	"plugin.md": {
		Options: { file: "src/vite/plugin/options.ts", type: "FlareOptions" },
		image: { file: "src/vite/plugin/options.ts", type: "FlareOptions", path: ["image"] },
		css: { file: "src/vite/plugin/options.ts", type: "FlareOptions", path: ["css"] },
		prerender: { file: "src/vite/prerender/run.ts", type: "PrerenderConfig" },
	},
	"router.md": { createRouter: { file: "src/shared/router/create-router.ts", type: "RouterOptions" } },
	"seo.md": {
		sitemap: { file: "src/features/seo/vite/sitemap.ts", type: "SitemapOptions" },
		indexNow: { file: "src/features/seo/server/index-now.ts", type: "IndexNowOptions" },
		googleIndexing: { file: "src/features/seo/server/google.ts", type: "GoogleIndexingOptions" },
		bingIndexing: { file: "src/features/seo/server/bing.ts", type: "BingIndexingOptions" },
	},
	"server.md": {
		createServer: { file: "src/server/lifecycle/options.ts", type: "ServerOptions" },
		mounts: { file: "src/server/mount/mount.ts", type: "Mount" },
		SecurityConfig: { file: TYPES, type: "SecurityConfig" },
		"serverCtx and withFetchDedupe": { file: "src/server/context/fetch-dedupe.ts", fn: "withFetchDedupe" },
		Middleware: { file: "src/server/middleware/types.ts", type: "MiddlewareFilter" },
		proxy: { file: "src/server/proxy/proxy.ts", fn: "proxy" },
	},
	"store.md": {
		createFilesystemStore: { file: "src/adapters/stores/fs/store.ts", fn: "createFilesystemStore" },
		createAssetsStore: { file: "src/server/cache/assets.ts", fn: "createAssetsStore" },
		createCacheApiStore: { file: "src/adapters/stores/cache-api/store.ts", fn: "createCacheApiStore" },
		revalidate: { file: "src/server/cache/revalidate.ts", fn: "revalidate" },
	},
};

it("option tables", () => {
	const unknown: string[] = [];
	for (const doc of readdirSync(dx).filter((name) => name.endsWith(".md"))) {
		const seen = new Map<string, number>();
		for (const table of tablesOf(readFileSync(join(dx, doc), "utf8"))) {
			const index = seen.get(table.heading) ?? 0;
			seen.set(table.heading, index + 1);
			const mapped = TABLES[doc]?.[table.heading];
			const source = Array.isArray(mapped) ? mapped[index] : index === 0 ? mapped : undefined;
			if (source === undefined) {
				unknown.push(`${doc} "${table.heading}" #${index + 1}: no source mapped`);
				continue;
			}
			if ("exempt" in source) continue;
			const keys = keysOfSource(source);
			const external = "type" in source ? (source.external?.names ?? []) : [];
			for (const name of table.names) {
				if (!external.includes(name) && !hasPath(keys, name.split("."))) {
					unknown.push(`${doc} "${table.heading}": ${name}`);
				}
			}
		}
	}
	expect(unknown).toEqual([]);
});

// The check bites: a table naming a key its type lacks is reported, and a Planned table is not.
it("bites", () => {
	const text =
		"# createRouter\n\n| prop | x |\n| --- | --- |\n| `basePath` | |\n| `nope` | |\n\n### Planned (plan 15)\n\n| prop |\n| --- |\n| `later` |\n";
	const [table, ...rest] = tablesOf(text);
	expect(rest).toEqual([]);
	const keys = keysOfSource({ file: "src/shared/router/create-router.ts", type: "RouterOptions" });
	expect(table?.names.filter((name) => !hasPath(keys, name.split(".")))).toEqual(["nope"]);
});

type Table = { heading: string; names: string[] };

// Every table whose first header cell is `prop` or `key`, with the nearest heading above it and the backticked names in
// its first column. A Planned heading exempts the tables under it.
function tablesOf(text: string): Table[] {
	const tables: Table[] = [];
	let heading = "";
	let current: Table | undefined;
	for (const line of text.split("\n")) {
		const title = /^#+ (.*)$/.exec(line);
		if (title !== null) heading = String(title[1]).replaceAll("`", "");
		if (!line.startsWith("|")) {
			current = undefined;
			continue;
		}
		const first = line.split("|")[1]?.trim() ?? "";
		if (current === undefined) {
			if ((first === "prop" || first === "key") && !heading.startsWith("Planned")) {
				current = { heading, names: [] };
				tables.push(current);
			} else current = { heading, names: [] };
			continue;
		}
		if (/^-+$/.test(first) || !tables.includes(current)) continue;
		// A quoted key such as `"96x96"` is that key.
		current.names.push(...[...first.matchAll(/`([^`]+)`/g)].map((match) => String(match[1]).replace(/^"(.*)"$/, "$1")));
	}
	return tables;
}

// A key's own keys, for a dotted name such as `entry.client`.
type Keys = Map<string, () => Keys>;

function hasPath(keys: Keys, path: readonly string[]): boolean {
	const [head, ...rest] = path;
	const next = head === undefined ? undefined : keys.get(head);
	if (next === undefined) return false;
	return rest.length === 0 || hasPath(next(), rest);
}

function keysOfSource(source: Exclude<Source, { exempt: string }>): Keys {
	const module = moduleOf(join(core, source.file));
	if ("fn" in source) return functionKeys(module, source.fn);
	const keys = keysOfName(module, source.type);
	return (source.path ?? []).reduce((found, key) => found.get(key)?.() ?? new Map(), keys);
}

type Module = {
	file: string;
	aliases: Map<string, unknown>;
	imports: Map<string, { file: string; name: string }>;
	functions: Map<string, unknown>;
};

const modules = new Map<string, Module>();

function moduleOf(file: string): Module {
	const known = modules.get(file);
	if (known !== undefined) return known;
	const module: Module = { file, aliases: new Map(), imports: new Map(), functions: new Map() };
	modules.set(file, module);
	for (const statement of list(get(parseSync(file, readFileSync(file, "utf8")).program, "body"))) {
		const declaration = get(statement, "type") === "ExportNamedDeclaration" ? get(statement, "declaration") : statement;
		const type = get(declaration, "type");
		const name = String(get(get(declaration, "id"), "name"));
		if (type === "TSTypeAliasDeclaration") module.aliases.set(name, get(declaration, "typeAnnotation"));
		if (type === "TSInterfaceDeclaration")
			module.aliases.set(name, { type: "TSTypeLiteral", members: get(get(declaration, "body"), "body") });
		if (type === "FunctionDeclaration") module.functions.set(name, declaration);
		if (get(statement, "type") === "ImportDeclaration") {
			const from = String(get(get(statement, "source"), "value"));
			if (!from.startsWith(".")) continue;
			for (const specifier of list(get(statement, "specifiers"))) {
				const imported = get(specifier, "imported");
				module.imports.set(String(get(get(specifier, "local"), "name")), {
					file: resolve(dirname(file), from),
					name: String(get(imported, "name")),
				});
			}
		}
	}
	return module;
}

function keysOfName(module: Module, name: string): Keys {
	const alias = module.aliases.get(name);
	if (alias !== undefined) return keysOf(module, alias);
	const imported = module.imports.get(name);
	return imported === undefined ? new Map() : keysOfName(moduleOf(imported.file), imported.name);
}

// The keys an object type names: literal members, every part of an intersection or a union, both branches of a
// conditional, an array's element, and a reference followed to its alias, through imports. `Partial`, `Readonly`, and
// `ReadonlyArray` pass their argument.
function keysOf(module: Module, node: unknown): Keys {
	const type = get(node, "type");
	if (type === "TSTypeLiteral") {
		const keys: Keys = new Map();
		for (const member of list(get(node, "members"))) {
			const key = get(member, "key");
			const name = get(key, "type") === "Identifier" ? get(key, "name") : get(key, "value");
			const annotation = get(get(member, "typeAnnotation"), "typeAnnotation");
			if (typeof name === "string") keys.set(name, () => keysOf(module, annotation));
		}
		return keys;
	}
	if (type === "TSIntersectionType" || type === "TSUnionType")
		return merged(list(get(node, "types")).map((part) => keysOf(module, part)));
	if (type === "TSConditionalType")
		return merged([keysOf(module, get(node, "trueType")), keysOf(module, get(node, "falseType"))]);
	if (type === "TSParenthesizedType" || type === "TSTypeOperator") return keysOf(module, get(node, "typeAnnotation"));
	if (type === "TSArrayType") return keysOf(module, get(node, "elementType"));
	return type === "TSTypeReference" ? keysOfReference(module, node) : new Map();
}

// A reference: a utility that passes, drops, or keeps keys of its argument, or a name followed to its alias.
function keysOfReference(module: Module, node: unknown): Keys {
	const name = String(get(get(node, "typeName"), "name"));
	const [first, second] = list(get(get(node, "typeArguments"), "params"));
	if (name === "Partial" || name === "Readonly" || name === "ReadonlyArray") return keysOf(module, first);
	// `Omit` drops the named keys and `Pick` keeps only them.
	if (name === "Omit" || name === "Pick") {
		const named = literals(second);
		return new Map([...keysOf(module, first)].filter(([key]) => named.has(key) === (name === "Pick")));
	}
	return keysOfName(module, name);
}

// A function's parameter names, then the keys of its last parameter's type: `proxy(request, upstream, options)`.
function functionKeys(module: Module, name: string): Keys {
	const params = list(get(module.functions.get(name), "params"));
	const keys: Keys = new Map();
	let last: unknown;
	for (const param of params) {
		const pattern = get(param, "type") === "AssignmentPattern" ? get(param, "left") : param;
		const annotation = get(get(pattern, "typeAnnotation"), "typeAnnotation");
		keys.set(String(get(pattern, "name")), () => keysOf(module, annotation));
		last = annotation;
	}
	for (const [key, value] of keysOf(module, last)) keys.set(key, value);
	return keys;
}

function merged(parts: readonly Keys[]): Keys {
	const keys: Keys = new Map();
	for (const part of parts) {
		for (const [key, value] of part) {
			const prior = keys.get(key);
			keys.set(key, prior === undefined ? value : () => merged([prior(), value()]));
		}
	}
	return keys;
}

// The string literals of a key union: `"to" | "params"`.
function literals(node: unknown): Set<string> {
	if (get(node, "type") === "TSUnionType")
		return new Set(list(get(node, "types")).flatMap((part) => [...literals(part)]));
	const value = get(get(node, "literal"), "value");
	return new Set(typeof value === "string" ? [value] : []);
}

function get(node: unknown, key: string): unknown {
	return typeof node === "object" && node !== null ? Reflect.get(node, key) : undefined;
}

function list(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}
