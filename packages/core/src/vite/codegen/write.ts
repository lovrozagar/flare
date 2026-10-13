import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { generateRoutes } from "./routes.ts";
import { generateServerFns } from "./server-fns.ts";
import { generateTypes } from "./types-gen.ts";

const OUT_DIR = "src/_gen";
const ROUTES_DIR = "src/routes";
const SCRIPT = /\.[cm]?[jt]sx?$/;
const PAGE = ".page.tsx";

// The files flare writes under src/_gen (dx/plugin.md). Their paths are not options.
export const GENERATED = ["routes.gen.ts", "types.gen.d.ts", "server-fns.gen.ts"] as const;

// Writes the generated files of the app at `root` and returns the root-relative paths it wrote or removed. Unchanged
// output is not written. An empty route set removes the route and type files. Files are read in UTF-16 code unit
// order, so the output does not depend on the file system's listing. A failure throws and names the file.
export function writeGenerated(root: string): string[] {
	const routeFiles = routeFilesOf(root);
	const appFiles = filesUnder(join(root, "src"))
		.map((file) => `src/${file}`)
		.filter((file) => SCRIPT.test(file) && !file.startsWith(`${OUT_DIR}/`));
	const read = (file: string): string => readFileSync(join(root, file), "utf8");
	const routed = routeFiles.some((file) => file.endsWith(PAGE));
	const sources = [
		routed ? generateRoutes(routeFiles, (file) => read(`${ROUTES_DIR}/${file}`)).source : undefined,
		routed ? generateTypes({ routeFiles, appFiles, read }).source : undefined,
		generateServerFns(appFiles, read).source,
	];
	return GENERATED.flatMap((name, index) => (settle(root, name, sources[index]) ? [`${OUT_DIR}/${name}`] : []));
}

// The files under src/routes, relative to it, in UTF-16 code unit order.
export function routeFilesOf(root: string): string[] {
	return filesUnder(join(root, ROUTES_DIR));
}

// Writes `source` when it differs, or removes the file when there is none. True when the file changed.
function settle(root: string, name: string, source: string | undefined): boolean {
	const path = join(root, OUT_DIR, name);
	const exists = existsSync(path);
	if (source === undefined) {
		if (exists) rmSync(path);
		return exists;
	}
	if (exists && readFileSync(path, "utf8") === source) return false;
	mkdirSync(join(root, OUT_DIR), { recursive: true });
	writeFileSync(path, source);
	return true;
}

// Every file under `dir`, relative to it with forward slashes, in UTF-16 code unit order. A missing dir has none.
function filesUnder(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"))
		.sort();
}

// What the watch needs of Vite's dev server.
export type WatchedServer = {
	watcher: { on(event: "all", listener: (event: string, path: string) => void): unknown };
	config: { logger: { error(message: string): void } };
};

// `vite dev` writes the files again after a short debounce when a source under src changes. A failure is reported
// and does not end the process. The generated files themselves are not sources.
export function watchGenerated(server: WatchedServer, root: string, delay = 50): void {
	const src = join(root, "src") + sep;
	const out = join(root, OUT_DIR) + sep;
	let timer: ReturnType<typeof setTimeout> | undefined;
	server.watcher.on("all", (_event, path) => {
		if (!path.startsWith(src) || path.startsWith(out)) return;
		clearTimeout(timer);
		timer = setTimeout(() => {
			try {
				writeGenerated(root);
			} catch (error) {
				server.config.logger.error(`[flare:codegen] ${String(error)}`);
			}
		}, delay);
	});
}
