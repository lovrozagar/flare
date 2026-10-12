import { encodeStatic, idPattern, patternSegments, type Segment } from "../route-tree/index.ts";
import { writeUrl, type SearchValue } from "./search.ts";

declare const hrefBrand: unique symbol;

export type Href = string & { readonly [hrefBrand]: never };

// A brand has no runtime value, so the checks below are the only way to make one, and each `as Href` follows them.
export function href(value: string): Href {
	if (value.charCodeAt(0) <= 0x20) throw new Error("href");
	if (value.startsWith("//")) throw new Error("href");
	if (value.startsWith("/")) return value as Href;
	const lower = value.toLowerCase();
	if (lower.startsWith("https:") || lower.startsWith("http:")) return value as Href;
	throw new Error("href");
}

type Params = Record<string, string | readonly string[] | undefined>;

export type BuildInput = {
	to: string;
	params?: Params | undefined;
	search?: Record<string, SearchValue> | undefined;
	hash?: string | undefined;
};

// The URL of a route id. The pattern comes from the same idPattern and segment parser the router matches with,
// so a built URL is always one the router matches (bit 05).
export function buildUrl(input: BuildInput): Href {
	const params = input.params ?? {};
	const parts = patternSegments(idPattern(input.to)).flatMap((segment) => urlParts(segment, params));
	const hash = input.hash?.replace(/^#/, "");
	return href(writeUrl({ path: `/${parts.join("/")}`, search: input.search, hash }));
}

// A static segment is path-encoded. A param value is one encoded segment, and a catch-all value is one per
// item. A missing optional value, or an empty optional catch-all, adds nothing.
function urlParts(segment: Segment, params: Params): string[] {
	if (segment.kind === "static") return [encodeStatic(segment.text)];
	const value = params[segment.name];
	const values = typeof value === "string" ? [value] : (value ?? []);
	if (values.length === 0 && segment.optional) return [];
	if (values.length === 0 || (segment.kind === "dynamic" && typeof value !== "string")) throw new Error(segment.name);
	return values.map(encodeParam);
}

function encodeParam(value: string): string {
	if (value.includes("/") || value.includes("\\")) throw new Error("param");
	let out = "";
	for (let index = 0; index < value.length; index += 1) {
		const char = value.charAt(index);
		if (char !== "%") {
			out += encodeURIComponent(char);
			continue;
		}
		const hex = value.slice(index + 1, index + 3);
		if (!isHex(hex.charAt(0)) || !isHex(hex.charAt(1))) throw new Error("param");
		out += `%${hex.toUpperCase()}`;
		index += 2;
	}
	return out;
}

function isHex(char: string): boolean {
	return char !== "" && "0123456789ABCDEFabcdef".includes(char);
}
