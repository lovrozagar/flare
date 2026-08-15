import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import type { VitePlugin } from "./types.ts";

const IMAGE_EXTS = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".tiff", ".webp"]);
const ANIMATED_EXTS = new Set([".gif"]);
const IMAGE_DEFAULT_WIDTHS = [640, 750, 828, 1080, 1200, 1920, 2048, 3840];
const IMAGE_DEFAULT_QUALITY = 75;

interface SharpInstance {
	metadata: () => Promise<{ height?: number; width?: number }>;
	resize: (width: number) => SharpInstance;
	toBuffer: () => Promise<Buffer>;
	webp: (opts?: { quality?: number }) => SharpInstance;
}

type SharpFactory = (input: string) => SharpInstance;

async function importSharp(): Promise<SharpFactory> {
	try {
		const mod = await import("sharp");
		return (mod.default ?? mod) as unknown as SharpFactory;
	} catch {
		throw new Error("sharp is required for image optimization. Install it: bun add sharp -D");
	}
}

interface ImagePluginContext {
	emitFile?: (file: { fileName: string; source: Buffer; type: "asset" }) => void;
	environment?: { config?: { mode?: string } };
}

interface NodeReq {
	url?: string;
}

interface NodeRes {
	end: (data?: unknown) => void;
	writeHead: (status: number, headers: Record<string, string | string[]>) => void;
}

export function createImagePlugin(
	config?: { image?: { exclude?: RegExp; quality?: number; widths?: number[] } },
	assetsBase: string = "/assets",
	assetsDir: string = "assets",
): VitePlugin {
	const quality = config?.image?.quality ?? IMAGE_DEFAULT_QUALITY;
	const configWidths = config?.image?.widths ?? IMAGE_DEFAULT_WIDTHS;
	const excludeRe = config?.image?.exclude;

	return {
		configureServer(server: unknown) {
			const srv = server as {
				middlewares?: {
					use: (fn: (req: NodeReq, res: NodeRes, next: (err?: unknown) => void) => void) => void;
				};
			};

			srv.middlewares?.use(async (req, res, next) => {
				if (!req.url?.startsWith("/_flare/image?")) return next();

				try {
					const url = new URL(req.url, "http://localhost");
					const src = url.searchParams.get("src");
					const w = Number(url.searchParams.get("w"));
					if (!src || !w) return next();

					/* Guard against path traversal — resolve symlinks then check within cwd */
					const resolvedSrc = resolve(src);
					if (!resolvedSrc.startsWith(process.cwd())) return next();
					let realSrc: string;
					try {
						realSrc = realpathSync(resolvedSrc);
					} catch {
						return next();
					}
					if (!realSrc.startsWith(process.cwd())) return next();

					const sharp = await importSharp();
					const sourceExt = extname(realSrc).toLowerCase();
					const isWebPSource = sourceExt === ".webp";
					const buf = isWebPSource
						? await sharp(realSrc).resize(w).toBuffer()
						: await sharp(realSrc).resize(w).webp({ quality }).toBuffer();

					res.writeHead(200, {
						"cache-control": "public, max-age=31536000, immutable",
						"content-type": "image/webp",
					});
					res.end(buf);
				} catch (e: unknown) {
					next(e);
				}
			});
			return undefined;
		},
		enforce: "pre",

		async load(this: ImagePluginContext, id: string): Promise<{ code: string; moduleType: string } | null> {
			if (!id.startsWith("\0flare-image:")) return null;
			const imagePath = id.slice("\0flare-image:".length);

			const sharp = await importSharp();
			const img = sharp(imagePath);
			const metadata = await img.metadata();
			const width = metadata.width ?? 0;
			const height = metadata.height ?? 0;

			/* Blur placeholder: 8px wide WebP → base64 data URI */
			const blurBuf = await sharp(imagePath).resize(8).webp({ quality: 20 }).toBuffer();
			const blurDataURL = `data:image/webp;base64,${blurBuf.toString("base64")}`;

			const isBuild = this.environment?.config?.mode !== "development";
			const stem = basename(imagePath, extname(imagePath));

			/* Compute variant widths — only ≤ original, always include original */
			const widths = configWidths.filter((w) => w <= width);
			if (!widths.includes(width)) widths.push(width);
			widths.sort((a, b) => a - b);

			if (isBuild) {
				const variants: Record<number, string> = {};
				for (const w of widths) {
					const buf = await sharp(imagePath).resize(w).webp({ quality }).toBuffer();
					const hash = createHash("sha256").update(buf).digest("hex").slice(0, 8);
					const filename = `${stem}-${w}-${hash}.webp`;
					const emitPath = assetsDir ? `${assetsDir}/${filename}` : filename;
					this.emitFile?.({ fileName: emitPath, source: buf, type: "asset" });
					variants[w] = `${assetsBase}/${filename}`;
				}

				const data = { blurDataURL, height, src: variants[width] ?? "", variants, width };
				return { code: `export default ${JSON.stringify(data)}`, moduleType: "js" };
			}

			/* Dev mode: variants served on-demand via middleware */
			const variants: Record<number, string> = {};
			for (const w of widths) {
				variants[w] = `/_flare/image?src=${encodeURIComponent(imagePath)}&w=${w}`;
			}

			const data = { blurDataURL, height, src: imagePath, variants, width };
			return { code: `export default ${JSON.stringify(data)}`, moduleType: "js" };
		},
		name: "flare:image",

		resolveId(id: string, importer?: unknown): string | null {
			/* Explicit Vite passthrough */
			if (id.includes("?url") || id.includes("?raw")) return null;

			const ext = extname(id).toLowerCase();

			/* SVG and animated formats: always pass through */
			if (ext === ".svg" || ANIMATED_EXTS.has(ext)) return null;

			if (!IMAGE_EXTS.has(ext)) return null;

			/* Resolve relative paths using the importer directory */
			let absolutePath = id;
			if (id.startsWith(".") && typeof importer === "string") {
				absolutePath = resolve(dirname(importer), id);
			}

			/* Check exclude regex against resolved path */
			if (excludeRe?.test(absolutePath)) return null;

			return `\0flare-image:${absolutePath}`;
		},
	};
}
