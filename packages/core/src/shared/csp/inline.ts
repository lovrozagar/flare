// What an inline script may not hold raw: `<` (so no `</script` or `<!--`), a backtick and `$` (so a template cannot
// open), and the two line separators.
const SCRIPT: ReadonlyArray<readonly [string, string]> = [
	["<", "\\u003c"],
	["`", "\\u0060"],
	["$", "\\u0024"],
	[" ", "\\u2028"],
	[" ", "\\u2029"],
];

export function escapeInlineJson(value: string): string {
	let out = value;
	for (const [from, to] of SCRIPT) out = out.replaceAll(from, to);
	return out;
}

// A value as a literal inside an inline script, such as a feature's before-paint script: JSON, escaped as above.
export function scriptLiteral(value: string | readonly string[]): string {
	return escapeInlineJson(JSON.stringify(value));
}
