import { copyFileSync, rmSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { pathToFileURL } from "node:url";

/*
 * `import()` through the runtime's own loader. Under `vite --configLoader runner`, plugin code is
 * evaluated in a module runner that rewrites every `import()` in module source and is closed once
 * the config is loaded, so a plugin importing a built bundle later (the preview server on a
 * request, prerender after the build) would get "Vite module runner has been closed". A Function
 * body is not module source, so no transform rewrites it.
 */
// oxlint-disable-next-line no-new-func -- the point: an import() no module transform can rewrite
const load = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;

let loads = 0;

/**
 * Imports a file as it is now. A `?query` can't bust the module cache everywhere (Bun keys it by
 * path alone), so this imports a sibling copy at a path never used before; the bundle's relative
 * imports still resolve from the same directory. The copy is removed once loaded.
 */
export async function importFileFresh<T>(path: string): Promise<T> {
	const ext = extname(path);
	const copy = join(dirname(path), `.${basename(path, ext)}.fresh-${process.pid}-${Date.now()}-${++loads}${ext}`);
	copyFileSync(path, copy);
	try {
		return (await importNative(pathToFileURL(copy).href)) as T;
	} finally {
		rmSync(copy, { force: true });
	}
}

/* A `vm` context without an import callback (vitest) can't run the Function's import(); no module
   runner rewrites `import()` there, so the plain one is right. */
async function importNative(url: string): Promise<unknown> {
	try {
		return await load(url);
	} catch (error) {
		if ((error as { code?: string }).code !== "ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING") throw error;
		return import(/* @vite-ignore */ url);
	}
}
