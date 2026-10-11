import { parseSegment, type Segment } from "./segments.ts";

export function matchPath(pattern: string, path: string, options: { caseSensitive?: boolean } = {}): boolean {
	if (matchParams(pattern, path) !== undefined) return true;
	if (pattern.includes("[...")) return false;
	const sensitive = options.caseSensitive === true;
	return segmentKey(pattern, sensitive, true) === segmentKey(path, sensitive, false);
}

export function matchParams(pattern: string, path: string): Record<string, string[] | undefined> | undefined {
	const segment = parseSegment(pattern)[0];
	if (segment === undefined) throw new Error(pattern);
	if (!isCatchAll(segment)) return undefined;
	const parts = path.split("/").filter((part) => part !== "");
	if (parts.length !== 0) return { [segment.name]: parts };
	if (!segment.optional) return undefined;
	return { [segment.name]: undefined };
}

function isCatchAll(segment: Segment): segment is { kind: "catch-all"; name: string; optional: boolean } {
	return segment.kind === "catch-all";
}

function segmentKey(value: string, sensitive: boolean, encode: boolean): string {
	return value
		.split("/")
		.filter((part) => part !== "")
		.map((part) => {
			const text = encode ? encodeURIComponent(part) : part;
			return sensitive ? text : text.toLowerCase();
		})
		.join("/");
}
