const BANNED = new Set(["__proto__", "constructor", "prototype"]);

export type SearchValue = string | readonly string[] | null | undefined;

export function readSearch(search: string): Record<string, string> {
	const record: Record<string, string> = Object.create(null);
	for (const pair of search.slice(1).split("&")) {
		const eq = pair.indexOf("=");
		const key = pair.slice(0, eq);
		if (BANNED.has(key)) continue;
		record[key] = pair.slice(eq + 1);
	}
	return record;
}

export function writeUrl(input: { path: string; search?: Record<string, SearchValue>; hash?: string }): string {
	return `${input.path}${writeQuery(input.search)}${writeHash(input.hash)}`;
}

function writeQuery(search: Record<string, SearchValue> | undefined): string {
	if (search === undefined) return "";
	const pairs: string[] = [];
	for (const key of Object.keys(search).sort()) pushValue(pairs, key, search[key]);
	if (pairs.length === 0) return "";
	return `?${pairs.join("&")}`;
}

function pushValue(pairs: string[], key: string, value: SearchValue): void {
	if (BANNED.has(key) || value === undefined || value === null) return;
	if (typeof value !== "string") {
		for (const item of value) pairs.push(encodePair(key, item));
		return;
	}
	pairs.push(encodePair(key, value));
}

function encodePair(key: string, value: string): string {
	return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function writeHash(hash: string | undefined): string {
	if (hash === undefined || hash === "") return "";
	return `#${hash}`;
}
