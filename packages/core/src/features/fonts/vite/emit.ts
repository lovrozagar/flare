import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The registry part the copy reads: each family's file urls, served under `/fonts/`.
export type FontRegistry = Record<string, { files: ReadonlyArray<{ url: string }> }>;

export type EmittedFont = { fileName: string; source: Uint8Array };

export type EmitFontsOptions = {
	registry: FontRegistry;
	families: readonly string[];
	// The directory that holds the woff2 files, laid out as the urls are below `/fonts/`.
	source: string;
	emit: (file: EmittedFont) => void;
};

// `/fonts/<family>/<file>.woff2`. A file name cannot start with a dot, so no segment is `.` or `..`.
const FONT_URL = /^\/fonts\/([a-z0-9-]+\/[A-Za-z0-9_-][A-Za-z0-9._-]*\.woff2)$/;

// A url maps to one file inside `source`. Any other url throws.
function fileOf(source: string, url: string): string {
	const inner = FONT_URL.exec(url)?.[1];
	if (inner === undefined) throw new Error(`font url ${url} leaves the font directory`);
	return join(source, inner);
}

// Copies the woff2 files of the families the app uses into the build output. Every url is checked before any file
// is read, so a bad url copies nothing.
export async function emitFonts(options: EmitFontsOptions): Promise<void> {
	const urls = options.families.flatMap((id) => {
		const family = options.registry[id];
		if (family === undefined) throw new Error(`${id} is not a registry font`);
		return family.files.map((file) => file.url);
	});
	const unique = [...new Set(urls)];
	const targets = unique.map((url) => ({ fileName: url.slice(1), path: fileOf(options.source, url) }));
	const files = await Promise.all(
		targets.map(async (target) => ({ fileName: target.fileName, source: new Uint8Array(await readFile(target.path)) })),
	);
	for (const file of files) options.emit(file);
}
