import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSync } from "oxc-parser";
import { expect, it } from "vitest";

// The option tables of the dx files name only keys the exported option types have (BUGS.md 113). Each `prop` or `key`
// table maps, by the heading above it, to a type in the source, or to a function whose parameters and last
// parameter's keys it lists. A table under a `Planned (plan 15)` heading documents what v1 does not ship and is
// exempt. A new table with no mapping fails, so it gets one.
const core = fileURLToPath(new URL("../../", import.meta.url));
const repo = join(core, "../..");

type Source = { file: string; type: string; path?: readonly string[] } | { file: string; fn: string };

const TABLES: Readonly<Record<string, Readonly<Record<string, Source>>>> = {
	"router.md": { createRouter: { file: "src/shared/router/create-router.ts", type: "RouterOptions" } },
	"server.md": {
		createServer: { file: "src/server/lifecycle/options.ts", type: "ServerOptions" },
		mounts: { file: "src/server/mount/mount.ts", type: "Mount" },
		SecurityConfig: { file: "src/shared/route-builder/types.ts", type: "SecurityConfig" },
		"serverCtx and withFetchDedupe": { file: "src/server/context/fetch-dedupe.ts", fn: "withFetchDedupe" },
		Middleware: { file: "src/server/middleware/types.ts", type: "MiddlewareFilter" },
		proxy: { file: "src/server/proxy/proxy.ts", fn: "proxy" },
	},
	"plugin.md": {
		Options: { file: "src/vite/plugin/options.ts", type: "FlareOptions" },
		image: { file: "src/vite/plugin/options.ts", type: "FlareOptions", path: ["image"] },
		css: { file: "src/vite/plugin/options.ts", type: "FlareOptions", path: ["css"] },
		prerender: { file: "src/vite/prerender/run.ts", type: "PrerenderConfig" },
	},
	"adapters.md": {
		Node: { file: "src/adapters/node/listener.ts", type: "NodeListenerOptions" },
		Workers: { file: "src/adapters/workers/handler.ts", fn: "createWorkersHandler" },
	},
};

it("option tables", () => {
	const unknown: string[] = [];
	for (const [doc, sources] of Object.entries(TABLES)) {
		for (const table of tablesOf(readFileSync(join(repo, "blueprint/dx", doc), "utf8"))) {
			const source = sources[table.heading];
			if (source === undefined) {
				unknown.push(`${doc} "${table.heading}": no source mapped`);
				continue;
			}
			const keys = keysOfSource(source);
			for (const name of table.names) {
				if (!hasPath(keys, name.split("."))) unknown.push(`${doc} "${table.heading}": ${name}`);
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
		current.names.push(...[...first.matchAll(/`([^`]+)`/g)].map((match) => String(match[1])));
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

function keysOfSource(source: Source): Keys {
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
// conditional, and a reference followed to its alias, through imports. `Partial` and `Readonly` pass their argument.
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
	if (type === "TSParenthesizedType") return keysOf(module, get(node, "typeAnnotation"));
	if (type !== "TSTypeReference") return new Map();
	const name = String(get(get(node, "typeName"), "name"));
	if (name === "Partial" || name === "Readonly")
		return keysOf(module, list(get(get(node, "typeArguments"), "params"))[0]);
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
	for (const part of parts)
		for (const [key, value] of part)
			keys.set(key, keys.has(key) ? () => merged([keys.get(key)?.() ?? new Map(), value()]) : value);
	return keys;
}

function get(node: unknown, key: string): unknown {
	return typeof node === "object" && node !== null ? Reflect.get(node, key) : undefined;
}

function list(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}
