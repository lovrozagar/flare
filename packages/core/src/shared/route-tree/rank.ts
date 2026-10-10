const RANK = { static: 0, dynamic: 1, "catch-all": 2 } as const;

export function pickRoute(patterns: readonly string[], path: string): string {
	return patterns
		.filter((pattern) => matches(pattern, path))
		.sort((left, right) => rank(left) - rank(right))[0] as string;
}

function rank(pattern: string): number {
	const part = head(pattern);
	if (part.startsWith("*")) return RANK["catch-all"];
	if (part.startsWith(":")) return RANK.dynamic;
	return RANK.static;
}

function matches(pattern: string, path: string): boolean {
	const part = head(pattern);
	const got = head(path);
	if (part.startsWith(":") || part.startsWith("*")) return got !== "";
	return part === got;
}

function head(value: string): string {
	return value.split("/").filter((part) => part !== "")[0] as string;
}
