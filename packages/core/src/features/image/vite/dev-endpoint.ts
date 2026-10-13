import { stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { DevEndpoint } from "../../../vite/dev/index.ts";
import { IMAGE_ENDPOINT, OPTIMIZED, type ImageSettings } from "./optimize.ts";

// `GET /_flare/image?src=<project path>&w=<width>[&q=<quality>]` in `vite dev` (dx/features.md Image). The flare
// plugin registers it behind the dev guard, so it answers same-origin requests only. A path outside the project, a
// width the plugin did not list, a file that is not an optimized image, or a bad quality is 400, before any file is
// read. A missing file inside the project is 404.
// `project.root` is read on each request: the dev server settles it after the plugin is made.
export function imageEndpoint(settings: ImageSettings, project: { readonly root: string }): DevEndpoint {
	return { path: IMAGE_ENDPOINT, handle: (request) => answer(request, settings, project.root) };
}

async function answer(request: Request, settings: ImageSettings, root: string): Promise<Response> {
	const query = new URL(request.url).searchParams;
	const file = inside(root, query.get("src"));
	const width = Number(query.get("w"));
	const quality = query.has("q") ? Number(query.get("q")) : settings.quality;
	const valid = Number.isInteger(quality) && quality >= 1 && quality <= 100;
	const image = file !== undefined && OPTIMIZED.test(file);
	if (!image || !settings.widths.includes(width) || !valid) return new Response(null, { status: 400 });
	if (!(await exists(file))) return new Response(null, { status: 404 });
	const { default: sharp } = await import("sharp");
	const bytes = await sharp(file).resize({ width }).webp({ quality }).toBuffer();
	return new Response(new Uint8Array(bytes), { status: 200, headers: { "content-type": "image/webp" } });
}

// The project path as a file under the root, or nothing when it leaves the root.
function inside(root: string, src: string | null): string | undefined {
	if (src === null || src === "") return undefined;
	const file = resolve(root, `.${src.startsWith("/") ? src : `/${src}`}`);
	const path = relative(root, file);
	return path.startsWith("..") || isAbsolute(path) ? undefined : file;
}

async function exists(file: string): Promise<boolean> {
	try {
		return (await stat(file)).isFile();
	} catch {
		return false;
	}
}
