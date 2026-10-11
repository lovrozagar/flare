import { parseSegment } from "./segments.ts";

export function readParams(pattern: string, path: string): Record<string, string> {
	const folders = pattern.split("/").filter((part) => part !== "");
	const values = path.split("/").filter((part) => part !== "");
	const params: Record<string, string> = {};
	for (const [index, folder] of folders.entries()) {
		const segment = parseSegment(folder)[0] as { kind: string; name: string };
		if (segment.kind === "dynamic") params[segment.name] = upperHex(values[index] as string);
	}
	return params;
}

function upperHex(value: string): string {
	let out = "";
	for (let index = 0; index < value.length; index += 1) {
		const char = value.charAt(index);
		if (char !== "%") {
			out += char;
			continue;
		}
		const hex = value.slice(index + 1, index + 3);
		if (!/^[0-9A-Fa-f]{2}$/.test(hex)) {
			out += "%";
			continue;
		}
		out += `%${hex.toUpperCase()}`;
		index += 2;
	}
	return out;
}
