const BANNED = new Set(["__proto__", "constructor", "prototype"]);

// The raw record of a `?query` (B31): values stay encoded. One occurrence of a key is a string, and two or more
// are a `string[]` in appearance order. A key with no `=` has the value "". An empty query is {}.
export function readSearch(search: string): Record<string, string | string[]> {
	const record: Record<string, string | string[]> = Object.create(null);
	for (const pair of search.slice(1).split("&")) {
		if (pair === "") continue;
		const eq = pair.indexOf("=");
		const key = eq === -1 ? pair : pair.slice(0, eq);
		if (BANNED.has(key)) continue;
		const value = eq === -1 ? "" : pair.slice(eq + 1);
		const held = record[key];
		record[key] = held === undefined ? value : [...(typeof held === "string" ? [held] : held), value];
	}
	return record;
}

export function writeUrl(input: { path: string; search?: object | undefined; hash?: string | undefined }): string {
	return `${input.path}${writeQuery(input.search)}${writeHash(input.hash)}`;
}

function writeQuery(search: object | undefined): string {
	if (search === undefined) return "";
	const record = entries(search);
	const pairs = Object.keys(record)
		.sort()
		.flatMap((key) => (BANNED.has(key) ? [] : urlText(key, record[key]).map((text) => encodePair(key, text))));
	if (pairs.length === 0) return "";
	return `?${pairs.join("&")}`;
}

// A params or search object as a record of its own keys, whatever type the caller's validator gave it.
export function entries(value: object): Record<string, unknown> {
	return Object.fromEntries(Object.entries(value));
}

// One rule turns a validator output back into URL text, so a plain value stays readable and parses back to the
// same value (dx/link.md URL values). An array is one entry per element, and a nullish value or element is none.
export function urlText(key: string, value: unknown): string[] {
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value)) return [scalar(key, value)];
	return value.flatMap((item: unknown) => (item === undefined || item === null ? [] : [scalar(key, item)]));
}

function scalar(key: string, value: {}): string {
	switch (typeof value) {
		case "string":
			return value;
		case "number":
		case "boolean":
		case "bigint":
			return String(value);
		case "function":
		case "symbol":
			throw new Error(key);
		default:
			return value instanceof Date ? value.toISOString() : JSON.stringify(value, bigints);
	}
}

// JSON has no bigint, so one inside an object is written as its digits.
function bigints(_key: string, value: unknown): unknown {
	return typeof value === "bigint" ? String(value) : value;
}

function encodePair(key: string, value: string): string {
	return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function writeHash(hash: string | undefined): string {
	if (hash === undefined || hash === "") return "";
	return `#${hash}`;
}
