import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import bcd from "@mdn/browser-compat-data" with { type: "json" };
import { parseSync } from "oxc-parser";
import { bindings, isReference, lineOf, lineStarts, visit, type Node, type Step } from "./browser-floor-ast.ts";

// The browser floor's scanner (decision B123, BUGS.md 123.4). The client runs where the build targets, Vite 8's
// `baseline-widely-available`: Chrome and Edge 111, Firefox 114, Safari 16.4. Each browser API a client-reachable source
// uses in a way that throws when the API is missing is looked up in @mdn/browser-compat-data, and one that a floor
// browser lacks is a finding:
// - a global read by name (`Iterator`, `requestIdleCallback`): a missing one is a ReferenceError;
// - a member of a global (`URL.parse`, `Promise.withResolvers`, `navigator.connection`, `globalThis.x`) that is called or
//   read through: a missing one is undefined, and calling or reading through it throws. A `?.` reads nothing through;
// - any other member called or read through, matched by name, since oxc gives no types: a finding when every
//   interface or builtin that has it, among those every floor browser has, is above the floor. So `.values()` on a Map
//   is not one, `.toSorted()` is (Firefox 115), and a member Flare's own objects share with an API no floor browser has
//   (`fetch` with BackgroundFetchManager) is not. Iterator's helpers count, called, since every array iterator has them;
// - `[Symbol.asyncIterator]` read, and `for await` over anything but an async generator's call: Safari before 27 cannot
//   iterate a stream (BUGS.md 123);
// - `addEventListener` of an event no floor browser fires (`scrollend`).
// `typeof X` and `"x" in y` are feature checks and read nothing, so they are never findings.

export const FLOOR = { chrome: 111, edge: 111, firefox: 114, safari: 16.4 } as const;

export type Finding = { file: string; line: number; api: string };

type Compat = {
	__compat?: {
		support: Record<string, Statement | Statement[]>;
		status?: { deprecated?: boolean; standard_track?: boolean };
	};
} & { [key: string]: unknown };
type Statement = {
	version_added: string | boolean | null;
	version_removed?: string | boolean | null;
	flags?: unknown;
	prefix?: string;
	alternative_name?: string;
};
// One source's scan: its text, a node's name when it reads a global the file does not declare, and the finding sink.
type Scan = { text: string; global: (node: Node) => string | undefined; add: (node: Node, name: string) => void };

const api = bcd.api as unknown as Record<string, Compat>;
const builtins = bcd.javascript.builtins as unknown as Record<string, Compat>;
// The global scope's own members (`requestIdleCallback`, `scrollend` on window) and its named instances.
const windowCompat = api["Window"] ?? {};
const SCOPES = new Set(["globalThis", "window", "self"]);
const INSTANCES: Record<string, string> = {
	navigator: "Navigator",
	document: "Document",
	location: "Location",
	history: "History",
	screen: "Screen",
	performance: "Performance",
	localStorage: "Storage",
	sessionStorage: "Storage",
	customElements: "CustomElementRegistry",
	visualViewport: "VisualViewport",
	crypto: "Crypto",
	navigation: "Navigation",
};

// The client-reachable sources: the client, everything shared with it, and each feature's client and shared code.
export function clientSources(core: string): string[] {
	const roots = ["src/client", "src/shared"];
	for (const feature of readdirSync(join(core, "src/features"))) {
		for (const side of ["client", "shared"]) roots.push(`src/features/${feature}/${side}`);
	}
	return roots.flatMap((root) => walk(core, root)).filter((path) => !/\.(test|fixture)\.tsx?$/.test(path));
}

function walk(core: string, dir: string): string[] {
	let entries;
	try {
		entries = readdirSync(join(core, dir), { withFileTypes: true });
	} catch {
		return [];
	}
	return entries.flatMap((entry) => {
		const path = `${dir}/${entry.name}`;
		if (entry.isDirectory()) return walk(core, path);
		return /\.tsx?$/.test(entry.name) ? [path] : [];
	});
}

export function scanFiles(core: string, files: readonly string[]): Finding[] {
	return files.flatMap((file) => scanSource(file, readFileSync(join(core, file), "utf8")));
}

export function scanSource(file: string, text: string): Finding[] {
	const { program, errors } = parseSync(file, text);
	if (errors.length > 0) throw new Error(`${file} does not parse: ${errors.map((error) => error.message).join("; ")}`);
	const bound = bindings(program as unknown as Node);
	const starts = lineStarts(text);
	const found: Finding[] = [];
	const scan: Scan = {
		text,
		global: (node) =>
			node.type === "Identifier" && !bound.has(String(node["name"])) ? String(node["name"]) : undefined,
		add: (node, name) => {
			const line = lineOf(starts, node.start);
			if (!found.some((finding) => finding.line === line && finding.api === name))
				found.push({ file, line, api: name });
		},
	};
	visit({ node: program as unknown as Node, key: "" }, (step) => {
		const { node, parent } = step;
		if (parent?.type === "UnaryExpression" && parent["operator"] === "typeof") return false;
		globalUse(step, scan);
		if (node.type === "MemberExpression") memberUse(step, scan);
		if (node.type === "CallExpression") listenerUse(node, scan);
		if (node.type === "ForOfStatement" && node["await"] === true) forAwaitUse(node, scan);
		return true;
	});
	return found;
}

// A global read by name, other than the global scope itself and its named instances, which their members check.
function globalUse(step: Step, scan: Scan): void {
	const name = scan.global(step.node);
	if (name === undefined || SCOPES.has(name) || INSTANCES[name] !== undefined) return;
	if (isReference(step.parent, step.key) && below(globalCompat(name))) scan.add(step.node, name);
}

function globalCompat(name: string): Compat | undefined {
	return builtins[name] ?? api[name] ?? (windowCompat[name] as Compat | undefined);
}

function memberUse(step: Step, scan: Scan): void {
	const { node, parent } = step;
	const property = node["property"] as Node;
	if (node["computed"] === true) {
		if (dotted(property) === "Symbol.asyncIterator") scan.add(node, "Symbol.asyncIterator");
		return;
	}
	const called = parent?.type === "CallExpression" && parent["callee"] === node && parent["optional"] !== true;
	const through = parent?.type === "MemberExpression" && parent["object"] === node && parent["optional"] !== true;
	if (!called && !through) return;
	const name = String(property["name"]);
	const owner = scan.global(node["object"] as Node);
	const known = owner === undefined ? undefined : globalMember(owner, name);
	if (known !== undefined) {
		if (known.below) scan.add(node, known.api);
	} else if (everyBelow(name, called)) scan.add(node, `.${name}`);
}

// A member of a global the scanner knows: the global scope's (`globalThis.x`), a named instance's
// (`navigator.connection`), or a builtin's or interface's static (`URL.parse`).
function globalMember(owner: string, name: string): { api: string; below: boolean } | undefined {
	if (SCOPES.has(owner)) return { api: name, below: below(globalCompat(name)) };
	const instance = INSTANCES[owner];
	const compat = instance === undefined ? (builtins[owner] ?? api[owner]) : api[instance];
	if (compat === undefined) return undefined;
	const member = compat[instance === undefined ? `${name}_static` : name] ?? compat[name];
	return { api: `${owner}.${name}`, below: below(member as Compat | undefined) };
}

// An async generator's call is the one async iterable client code may loop over (BUGS.md 123).
function forAwaitUse(node: Node, scan: Scan): void {
	const right = node["right"] as Node;
	if (right.type === "CallExpression" && (right["callee"] as Node).type === "Identifier") return;
	scan.add(node, `for await over ${scan.text.slice(right.start, right.end)}`);
}

// An event no floor browser fires leaves its listener dead.
function listenerUse(node: Node, scan: Scan): void {
	const callee = node["callee"] as Node;
	const method = callee.type === "MemberExpression" ? (callee["property"] as Node) : callee;
	const event = (node["arguments"] as Node[])[0];
	if (method["name"] !== "addEventListener" || event?.type !== "Literal" || typeof event["value"] !== "string") return;
	if (everyBelow(`${event["value"]}_event`, false)) scan.add(node, `${event["value"]} event`);
}

// The standard, current members of the interfaces and builtins every floor browser has, by name. Iterator's helpers
// count by call only. A deprecated or non-standard member (`CompositionEvent.locale`) is no API client code relies on.
const owners = new Map<string, Compat[]>();
for (const compat of [...Object.values(api), ...Object.values(builtins)]) {
	if (below(compat)) continue;
	for (const [name, value] of Object.entries(compat)) {
		const status = (value as Compat).__compat?.status;
		if (name.startsWith("__") || name.endsWith("_static")) continue;
		if (status?.deprecated === true || status?.standard_track === false) continue;
		owners.set(name, [...(owners.get(name) ?? []), value as Compat]);
	}
}

function everyBelow(name: string, called: boolean): boolean {
	const helper = called ? (builtins["Iterator"]?.[name] as Compat | undefined) : undefined;
	const have = [...(owners.get(name) ?? []), ...(helper === undefined ? [] : [helper])];
	return have.length > 0 && have.every(below);
}

// A feature some floor browser lacks: missing, behind a flag or prefix, or added after the floor. A partial
// implementation is there, so a use of it does not throw.
export function below(compat: Compat | undefined): boolean {
	const support = compat?.__compat?.support;
	if (support === undefined) return false;
	return Object.entries(FLOOR).some(([browser, floor]) => !supports([support[browser] ?? []].flat(), floor));
}

function supports(statements: readonly Statement[], floor: number): boolean {
	return statements.some((statement) => {
		if (statement.flags !== undefined || statement.prefix !== undefined || statement.alternative_name !== undefined) {
			return false;
		}
		const added = version(statement.version_added);
		const removed = version(statement.version_removed ?? null);
		return added !== undefined && added <= floor && (removed === undefined || removed > floor);
	});
}

// "≤79" is at or before 79. `true` is a version BCD does not know, so it is not counted as at the floor.
function version(value: string | boolean | null): number | undefined {
	if (typeof value !== "string" || value === "preview") return undefined;
	const number = Number.parseFloat(value.replace("≤", ""));
	return Number.isNaN(number) ? undefined : number;
}

function dotted(node: Node): string | undefined {
	if (node.type !== "MemberExpression" || node["computed"] === true) return undefined;
	const object = node["object"] as Node;
	return object.type === "Identifier"
		? `${String(object["name"])}.${String((node["property"] as Node)["name"])}`
		: undefined;
}
