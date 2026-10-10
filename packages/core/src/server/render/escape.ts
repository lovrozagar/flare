const SCRIPT: ReadonlyArray<readonly [string, string]> = [
	["<", "\\u003c"],
	["`", "\\u0060"],
	["$", "\\u0024"],
	["\u2028", "\\u2028"],
	["\u2029", "\\u2029"],
];

export function escapeInlineJson(value: string): string {
	let out = value;
	for (const [from, to] of SCRIPT) out = out.replaceAll(from, to);
	return out;
}

export function escapeInlineScript(value: string): string {
	return escapeInlineJson(value);
}

export function escapeAttr(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("\n", "&#10;").replaceAll("\r", "&#13;");
}
