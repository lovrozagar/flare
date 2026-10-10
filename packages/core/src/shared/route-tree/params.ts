import { parseSegment } from "./segments.ts";

export function readParams(pattern: string, path: string): Record<string, string> {
	const folders = pattern.split("/").filter((part) => part !== "");
	const values = path.split("/").filter((part) => part !== "");
	const params: Record<string, string> = {};
	for (const [index, folder] of folders.entries()) {
		const segment = parseSegment(folder)[0] as { kind: string; name: string };
		if (segment.kind === "dynamic") params[segment.name] = values[index] as string;
	}
	return params;
}
