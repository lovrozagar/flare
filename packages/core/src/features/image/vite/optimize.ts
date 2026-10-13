import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, extname, isAbsolute, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { assetsDirOf, assetUrl } from "../../../vite/plugin/index.ts";

// `flare({ image })` after parsing (dx/plugin.md image).
export type ImageSettings = { widths: readonly number[]; quality: number; exclude?: RegExp | undefined };

type Binding = { src: string; width: number; height: number; variants: Array<{ width: number; src: string }> };

// The extensions the plugin converts to webp. `.svg` and `.gif` keep the URL Vite gives them.
export const OPTIMIZED: RegExp = /\.(?:avif|jpe?g|png|tiff|webp)$/i;

// The module the Image component reads its widths and quality from.
const CONFIG = fileURLToPath(new URL("../shared/config.ts", import.meta.url));

export const IMAGE_ENDPOINT = "/_flare/image";

const IMAGE_QUERY = "?image";

// One variant's webp bytes at the plugin quality. A width the plugin did not list is a build error. sharp loads only
// here, so an app without `image` never loads it.
export async function encodeVariant(file: string, width: number, settings: ImageSettings): Promise<Uint8Array> {
	if (!settings.widths.includes(width)) {
		throw new Error(`image width ${width} is not configured: the widths are ${settings.widths.join(", ")}`);
	}
	const { default: sharp } = await import("sharp");
	return sharp(file).resize({ width }).webp({ quality: settings.quality }).toBuffer();
}

// The intrinsic size of an image file.
export async function intrinsicSize(file: string): Promise<{ width: number; height: number }> {
	const { default: sharp } = await import("sharp");
	const meta = await sharp(file).metadata();
	return { width: Number(meta.width), height: Number(meta.height) };
}

// What the load hook uses of Vite's plugin context.
type LoadContext = {
	emitFile: (file: { type: "asset"; fileName: string; source: Uint8Array }) => string;
	environment: { name: string; config: { command: string } };
};

type Target = { settings: ImageSettings; assetsBase: string; base: string };

// An optimized import binds to `{ src, width, height, variants }` (B88). Dev points each variant at the dev endpoint.
// A build encodes each configured width that fits, names it `<stem>-<width>-<8 hex sha256>.webp` under the assets
// directory, and emits it from the client build. The server build points at the same files. `src` is the largest
// variant. The plugin also replaces config.ts with the app's widths and quality.
export function imagePlugin(settings: ImageSettings, assetsBase: string): Plugin {
	const state = { base: "/", root: process.cwd() };
	return {
		name: "flare:image",
		enforce: "pre",
		configResolved(config) {
			state.base = config.base;
			state.root = config.root;
		},
		load(id) {
			if (id === CONFIG) return configModule(settings);
			const file = imageImport(id);
			const path = file === undefined ? undefined : projectPath(state.root, file);
			if (file === undefined || path === undefined || settings.exclude?.test(path) === true) return null;
			return bindingModule(this, { id: file, path }, { settings, assetsBase, base: state.base });
		},
	};
}

async function bindingModule(
	context: LoadContext,
	file: { id: string; path: string },
	target: Target,
): Promise<string> {
	const size = await intrinsicSize(file.id);
	const widths = target.settings.widths.filter((width) => width <= size.width).toSorted((a, b) => a - b);
	const variants: Binding["variants"] = [];
	for (const width of widths) variants.push({ width, src: await variantUrl(context, { ...file, width }, target) });
	const src = variants.at(-1)?.src ?? (await original(context, file, target));
	return `export default ${JSON.stringify({ src, ...size, variants } satisfies Binding)};\n`;
}

async function variantUrl(context: LoadContext, file: { id: string; path: string; width: number }, target: Target) {
	if (context.environment.config.command === "serve") return devImageUrl(file.path, file.width);
	const bytes = await encodeVariant(file.id, file.width, target.settings);
	return emitted(context, `${variantName(file.id, file.width, bytes)}`, { bytes, target });
}

// Written under the assets directory by the client build. Both builds get the same URL from the one resolver.
function emitted(context: LoadContext, name: string, at: { bytes: Uint8Array; target: Target }): string {
	const fileName = `${assetsDirOf(at.target.assetsBase)}/${name}`;
	if (context.environment.name === "client") context.emitFile({ type: "asset", fileName, source: at.bytes });
	return assetUrl(fileName, { base: at.target.base, assetsBase: at.target.assetsBase });
}

export function devImageUrl(path: string, width: number): string {
	return `${IMAGE_ENDPOINT}?src=/${encodeURI(path)}&w=${width}`;
}

function variantName(file: string, width: number, bytes: Uint8Array): string {
	const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 8);
	return `${basename(file, extname(file))}-${width}-${hash}.webp`;
}

// An optimized import opts in with exactly `?image` on an optimized extension (B88). Any other query, and a plain
// import, stay Vite's.
function imageImport(id: string): string | undefined {
	if (!id.endsWith(IMAGE_QUERY)) return undefined;
	const file = id.slice(0, -IMAGE_QUERY.length);
	return OPTIMIZED.test(file) && !file.includes("?") ? file : undefined;
}

// An app module's path under the root, with forward slashes. A file outside the root, or a virtual module, is not one.
function projectPath(root: string, id: string): string | undefined {
	if (id.startsWith("\0")) return undefined;
	const path = relative(root, id);
	if (path.startsWith("..") || isAbsolute(path)) return undefined;
	return path.split(sep).join("/");
}

// An image narrower than every configured width has no variant. Dev serves the file. A build emits it as it is.
async function original(context: LoadContext, file: { id: string; path: string }, target: Target): Promise<string> {
	if (context.environment.config.command === "serve") return `/${file.path}`;
	const bytes = await readFile(file.id);
	const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 8);
	return emitted(context, `${basename(file.id, extname(file.id))}-${hash}${extname(file.id)}`, { bytes, target });
}

function configModule(settings: ImageSettings): string {
	return `export const imageWidths = ${JSON.stringify(settings.widths)};\nexport const imageQuality = ${settings.quality};\n`;
}
