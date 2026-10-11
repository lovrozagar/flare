declare const hrefBrand: unique symbol;

export type Href = string & { readonly [hrefBrand]: never };

export function href(value: string): Href {
	if (value.charCodeAt(0) <= 0x20) throw new Error("href");
	if (value.startsWith("//")) throw new Error("href");
	if (value.startsWith("/")) return value as Href;
	const lower = value.toLowerCase();
	if (lower.startsWith("https:") || lower.startsWith("http:")) return value as Href;
	throw new Error("href");
}

export function buildUrl(input: { to: string; params?: Record<string, string> }): Href {
	return href(fill(input.to, input.params ?? {}));
}

function fill(id: string, params: Record<string, string>): string {
	const parts: string[] = [];
	for (const part of id.split("/")) {
		if (part.startsWith("_")) continue;
		const name = readParam(part);
		if (name === undefined) {
			parts.push(part);
			continue;
		}
		const value = params[name];
		if (value === undefined) throw new Error(name);
		parts.push(encodeParam(value));
	}
	return `/${parts.join("/")}`;
}

function readParam(part: string): string | undefined {
	if (!part.startsWith("[")) return undefined;
	return part.slice(1, -1);
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
	return char !== "" && "0123456789ABCDEF".includes(char);
}
