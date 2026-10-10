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
