import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The fields flare reads from the app's Workers config: the assets binding the worker entry forwards to, and what a
// local runtime needs to start it. Nothing else of the file is read.
export type WorkersConfig = { binding?: string; compatibilityDate?: string; compatibilityFlags: string[] };

// The worker environment exists when the root has `wrangler.jsonc` or `wrangler.json`. A `wrangler.toml` throws:
// flare reads two fields and takes no TOML dependency for them.
export function readWrangler(root: string): WorkersConfig | undefined {
	if (existsSync(join(root, "wrangler.toml"))) {
		throw new Error("wrangler.toml is not read: write the Workers config as wrangler.jsonc");
	}
	const file = ["wrangler.jsonc", "wrangler.json"].map((name) => join(root, name)).find((path) => existsSync(path));
	if (file === undefined) return undefined;
	const parsed: unknown = JSON.parse(jsonOf(readFileSync(file, "utf8")));
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error(`${file} is not an object`);
	}
	const assets: unknown = Reflect.get(parsed, "assets");
	const binding = typeof assets === "object" && assets !== null ? Reflect.get(assets, "binding") : undefined;
	const date: unknown = Reflect.get(parsed, "compatibility_date");
	const flags: unknown = Reflect.get(parsed, "compatibility_flags");
	return {
		...(typeof binding === "string" ? { binding } : {}),
		...(typeof date === "string" ? { compatibilityDate: date } : {}),
		compatibilityFlags: Array.isArray(flags) ? flags.filter((flag) => typeof flag === "string") : [],
	};
}

// JSONC as JSON: comments outside strings are dropped, and so is a comma whose next token closes an object or array.
export function jsonOf(text: string): string {
	let out = "";
	let at = 0;
	while (at < text.length) {
		const skipped = skip(text, at);
		if (skipped > at) {
			at = skipped;
			continue;
		}
		const char = text.charAt(at);
		const end = char === '"' ? stringEnd(text, at) : at + 1;
		const trailing = char === "," && /[}\]]/.test(text.charAt(skip(text, end)));
		if (!trailing) out += text.slice(at, end);
		at = end;
	}
	return out;
}

// Past any whitespace and comments that start at `at`.
function skip(text: string, at: number): number {
	let next = at;
	for (;;) {
		while (/\s/.test(text[next] ?? "")) next += 1;
		if (text.startsWith("//", next)) next = lineEnd(text, next);
		else if (text.startsWith("/*", next)) next = commentEnd(text, next);
		else return next;
	}
}

function lineEnd(text: string, at: number): number {
	const end = text.indexOf("\n", at);
	return end === -1 ? text.length : end;
}

function commentEnd(text: string, at: number): number {
	const end = text.indexOf("*/", at + 2);
	return end === -1 ? text.length : end + 2;
}

// The index just past a string that starts at `at`. A backslash escapes the next character.
function stringEnd(text: string, at: number): number {
	let end = at + 1;
	while (end < text.length && text[end] !== '"') end += text[end] === "\\" ? 2 : 1;
	return end + 1;
}
