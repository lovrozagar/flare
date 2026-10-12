export type Segment =
	| { kind: "static"; text: string }
	| { kind: "dynamic"; name: string; optional: boolean }
	| { kind: "catch-all"; name: string; optional: boolean };

const FORMS: ReadonlyArray<{ pattern: RegExp; build: (name: string) => Segment }> = [
	{ pattern: /^\[_\]([^[\]]+)\]$/, build: (text) => ({ kind: "static", text: `[${text}]` }) },
	{
		pattern: /^\[\[\.\.\.([A-Za-z_][A-Za-z0-9_]*)\]\]$/,
		build: (name) => ({ kind: "catch-all", name, optional: true }),
	},
	{ pattern: /^\[\[([A-Za-z_][A-Za-z0-9_]*)\]\]$/, build: (name) => ({ kind: "dynamic", name, optional: true }) },
	{ pattern: /^\[\.\.\.([A-Za-z_][A-Za-z0-9_]*)\]$/, build: (name) => ({ kind: "catch-all", name, optional: false }) },
	{ pattern: /^\[([A-Za-z_][A-Za-z0-9_]*)\]$/, build: (name) => ({ kind: "dynamic", name, optional: false }) },
];

// A group `(name)` adds no URL segment.
export function parseSegment(folder: string): Segment[] {
	if (isGroup(folder)) return [];
	if (!folder.startsWith("[")) return [{ kind: "static", text: folder }];
	for (const form of FORMS) {
		const name = form.pattern.exec(folder)?.[1];
		if (name !== undefined) return [form.build(name)];
	}
	throw new Error(`bad brackets: ${folder}`);
}

function isGroup(folder: string): boolean {
	return folder.startsWith("(") && folder.endsWith(")");
}

// dx/routes.md: a root folder starts and ends with `_` and has at least three characters.
export function isRootFolder(folder: string): boolean {
	return folder.length > 2 && folder.startsWith("_") && folder.endsWith("_");
}

// The URL pattern of a route or layout id (dx/routes.md). The root folder is removed. Before it, a param
// folder stays and any other folder is removed. After it, a group adds no segment.
export function idPattern(id: string): string {
	const folders = id.split("/");
	const root = folders.findIndex(isRootFolder);
	const kept = folders.filter((folder, index) => {
		if (index === root) return false;
		if (index < root) return parseSegment(folder).some((segment) => segment.kind !== "static");
		return parseSegment(folder).length > 0;
	});
	return `/${kept.join("/")}`;
}
