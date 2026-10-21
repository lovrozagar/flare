import { createHash } from "node:crypto"
import { basename, extname, isAbsolute, relative, sep } from "node:path"
import type { Plugin } from "vite"
import { assetsDirOf, assetUrl, ownModule } from "../../../vite/plugin/index.ts"

// `flare({ image })` after parsing (dx/plugin.md image).
export type ImageSettings = { widths: readonly number[]; quality: number; exclude?: RegExp | undefined }

type Binding = { src: string; width: number; height: number; variants: Array<{ width: number; src: string }> }

// The extensions the plugin converts to webp. `.svg` and `.gif` keep the URL Vite gives them.
export const OPTIMIZED: RegExp = /\.(?:avif|jpe?g|png|tiff|webp)$/i

// The module the Image component reads its widths and quality from.
const CONFIG = ownModule("../shared/config.ts", import.meta.url)

export const IMAGE_ENDPOINT = "/_flare/image"

const IMAGE_QUERY = "?image"

// One variant's webp bytes at the plugin quality, turned upright by the image's EXIF orientation as a browser shows the
// original, with no orientation left for a viewer to apply twice (plan 21 3.16). A width the plugin did not list is an
// error. sharp loads only here, so an app without `image` never loads it.
export async function encodeVariant(file: string, width: number, settings: ImageSettings): Promise<Uint8Array> {
	if (!(await encodedWidth(file, width, settings))) {
		throw new Error(`image width ${width} is not configured: the widths are ${settings.widths.join(", ")}`)
	}
	const { default: sharp } = await import("sharp")
	return sharp(file).autoOrient().resize({ width }).webp({ quality: settings.quality }).toBuffer()
}

// A width the plugin encodes the file at: a configured one, or the image's own width when it is narrower than every
// configured width, its one variant (BUGS.md 454).
export async function encodedWidth(file: string, width: number, settings: ImageSettings): Promise<boolean> {
	if (settings.widths.includes(width)) return true
	return belowWidths(width, settings) && (await intrinsicSize(file)).width === width
}

// Whether `width` could be an image's own width below every configured width, before any file is read.
export function belowWidths(width: number, settings: ImageSettings): boolean {
	return Number.isInteger(width) && width >= 1 && width < Math.min(...settings.widths)
}

// Whether a path relative to the root leaves it: `..` itself, or `..` and a separator. `..name` is a file in the
// project (BUGS.md 457).
export function leavesRoot(path: string): boolean {
	return /^\.\.(?:[\\/]|$)/.test(path) || isAbsolute(path)
}

// The intrinsic size of an image file, as it shows: upright by its EXIF orientation.
export async function intrinsicSize(file: string): Promise<{ width: number; height: number }> {
	const { default: sharp } = await import("sharp")
	const meta = await sharp(file).metadata()
	return { width: meta.autoOrient.width, height: meta.autoOrient.height }
}

// What the load hook uses of Vite's plugin context.
type LoadContext = {
	emitFile: (file: { type: "asset"; fileName: string; source: Uint8Array }) => string
	environment: { name: string; config: { command: string } }
}

type Target = { settings: ImageSettings; assetsBase: string; base: string }

// An optimized import binds to `{ src, width, height, variants }` (B88). Dev points each variant at the dev endpoint.
// A build encodes each configured width that fits, names it `<stem>-<width>-<8 hex sha256>.webp` under the assets
// directory, and emits it from the client build. The server build points at the same files. `src` is the largest
// variant. The plugin also replaces config.ts with the app's widths and quality.
export function imagePlugin(settings: ImageSettings, assetsBase: string): Plugin {
	const state = { base: "/", root: process.cwd() }
	return {
		name: "flare:image",
		enforce: "pre",
		configResolved(config) {
			state.base = config.base
			state.root = config.root
		},
		load(id) {
			if (id === CONFIG) return configModule(settings)
			const file = imageImport(id)
			if (file === undefined || file.startsWith("\0")) return null
			const path = projectPath(state.root, file)
			if (settings.exclude?.test(path) === true) return null
			return bindingModule(this, { id: file, path }, { settings, assetsBase, base: state.base })
		},
	}
}

async function bindingModule(
	context: LoadContext,
	file: { id: string; path: string },
	target: Target,
): Promise<string> {
	const size = await intrinsicSize(file.id)
	const fit = target.settings.widths.filter((width) => width <= size.width).toSorted((a, b) => a - b)
	// An image narrower than every configured width is one webp at its own width (BUGS.md 454).
	const widths = fit.length > 0 ? fit : [size.width]
	const variants: Binding["variants"] = []
	// The widest variant's URL is the binding's `src`; `widths` is ascending and never empty.
	let src = ""
	for (const width of widths) {
		src = await variantUrl(context, { ...file, width }, target)
		variants.push({ width, src })
	}
	return `export default ${JSON.stringify({ src, ...size, variants } satisfies Binding)};\n`
}

async function variantUrl(context: LoadContext, file: { id: string; path: string; width: number }, target: Target) {
	if (context.environment.config.command === "serve") return devImageUrl(file.path, file.width)
	const bytes = await encodeVariant(file.id, file.width, target.settings)
	return emitted(context, `${variantName(file.id, file.width, bytes)}`, { bytes, target })
}

// Written under the assets directory by the client build. Both builds get the same URL from the one resolver.
function emitted(context: LoadContext, name: string, at: { bytes: Uint8Array; target: Target }): string {
	const fileName = `${assetsDirOf(at.target.assetsBase)}/${name}`
	if (context.environment.name === "client") context.emitFile({ type: "asset", fileName, source: at.bytes })
	// The URL names the file percent-encoded, so `%`, a space, or a comma in it reads back as the file (BUGS.md 432).
	const named = `${assetsDirOf(at.target.assetsBase)}/${encodeURIComponent(name)}`
	return assetUrl(named, { base: at.target.base, assetsBase: at.target.assetsBase })
}

// Each segment percent-encoded, so `+`, `&`, and `#` in a name reach the endpoint as written (BUGS.md 456).
export function devImageUrl(path: string, width: number): string {
	return `${IMAGE_ENDPOINT}?src=/${path.split("/").map(encodeURIComponent).join("/")}&w=${width}`
}

function variantName(file: string, width: number, bytes: Uint8Array): string {
	const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 8)
	return `${basename(file, extname(file))}-${width}-${hash}.webp`
}

// An optimized import opts in with exactly `?image` on an optimized extension (B88). Any other query, and a plain
// import, stay Vite's.
function imageImport(id: string): string | undefined {
	if (!id.endsWith(IMAGE_QUERY)) return undefined
	const file = id.slice(0, -IMAGE_QUERY.length)
	return OPTIMIZED.test(file) && !file.includes("?") ? file : undefined
}

// An app module's path under the root, with forward slashes. An optimized import outside the root fails the build, as
// the doc says, rather than falling through to Vite's plain URL (BUGS.md 455).
function projectPath(root: string, id: string): string {
	const path = relative(root, id)
	if (leavesRoot(path)) {
		throw new Error(`${id}?image is outside the project root ${root}: an optimized image lives under the root`)
	}
	return path.split(sep).join("/")
}

function configModule(settings: ImageSettings): string {
	const widths = `export const imageWidths = ${JSON.stringify(settings.widths)};\n`
	return `${widths}export const imageQuality = ${settings.quality};\nexport const imageConfigured = true;\n`
}
