import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { fixIds } from "./fix-ids.ts"
import { generateRoutes, routeIdOf } from "./routes.ts"
import { scanRoute } from "./scan.ts"
import { generateServerFns } from "./server-fns.ts"
import { generateTypes } from "./types-gen.ts"

const OUT_DIR = "src/_gen"
const ROUTES_DIR = "src/routes"
const SCRIPT = /\.[cm]?[jt]sx?$/
const PAGE = ".page.tsx"

// The files flare writes under src/_gen (dx/plugin.md). Their paths are not options.
export const GENERATED = ["routes.gen.ts", "types.gen.d.ts", "server-fns.gen.ts"] as const

// `fixIds`: `vite dev` writes each route file's id string first (BUGS.md 130). A build only checks it. `log` gets one
// line per rewritten file.
export type GenerateOptions = { fixIds?: boolean; log?: (line: string) => void }

// Writes the generated files of the app at `root` and returns the root-relative paths it wrote or removed. Unchanged
// output is not written. An empty route set removes the route and type files. Files are read in UTF-16 code unit
// order, so the output does not depend on the file system's listing. A failure throws and names the file.
export function writeGenerated(root: string, options: GenerateOptions = {}): string[] {
	const routeFiles = routeFilesOf(root)
	if (options.fixIds === true) fixRouteIds(root, routeFiles, options.log)
	const appFiles = filesUnder(join(root, "src"))
		.map((file) => `src/${file}`)
		.filter((file) => SCRIPT.test(file) && !file.startsWith(`${OUT_DIR}/`))
	const read = (file: string): string => readFileSync(join(root, file), "utf8")
	const routed = routeFiles.some((file) => file.endsWith(PAGE))
	const sources = [
		routed ? generateRoutes(routeFiles, (file) => read(`${ROUTES_DIR}/${file}`)).source : undefined,
		routed ? generateTypes({ routeFiles, appFiles, read }).source : undefined,
		generateServerFns(appFiles, read).source,
	]
	return GENERATED.flatMap((name, index) => (settle(root, name, sources[index]) ? [`${OUT_DIR}/${name}`] : []))
}

type Fix = { file: string; path: string; source: string; fixed: string; line: string }

// Each route file whose resolved id strings disagree with its path is rewritten to it, as TanStack Router's generator
// does (dx/routes.md, BUGS.md 130). Every fix is read first, then written; a file whose text changed since it was read,
// an editor's save, is left as saved for the next pass. A file the scan cannot parse is left for the routes to report.
function fixRouteIds(root: string, files: readonly string[], log: GenerateOptions["log"]): void {
	const fixes = files.flatMap((file): Fix[] => {
		const id = routeIdOf(file)
		if (id === undefined) return []
		const path = join(root, ROUTES_DIR, file)
		const source = readFileSync(path, "utf8")
		const ids = parsedIds(file, source)
		const fixed = fixIds(source, id, ids)
		if (fixed === source) return []
		const wrong = [...new Set(ids.map((found) => found.id).filter((found) => found !== id))]
		const line = `[flare:codegen] ${ROUTES_DIR}/${file}: id ${wrong.map((found) => JSON.stringify(found)).join(", ")} -> ${JSON.stringify(id)}`
		return [{ file, path, source, fixed, line }]
	})
	for (const fix of fixes) {
		if (readFileSync(fix.path, "utf8") !== fix.source) continue
		writeFileSync(fix.path, fix.fixed)
		log?.(fix.line)
	}
}

function parsedIds(file: string, source: string): ReturnType<typeof scanRoute>["ids"] {
	try {
		return scanRoute(file, source).ids
	} catch {
		return []
	}
}

// The files under src/routes, relative to it, in UTF-16 code unit order.
export function routeFilesOf(root: string): string[] {
	return filesUnder(join(root, ROUTES_DIR))
}

// Writes `source` when it differs, or removes the file when there is none. True when the file changed.
function settle(root: string, name: string, source: string | undefined): boolean {
	const path = join(root, OUT_DIR, name)
	const exists = existsSync(path)
	if (source === undefined) {
		if (exists) rmSync(path)
		return exists
	}
	if (exists && readFileSync(path, "utf8") === source) return false
	mkdirSync(join(root, OUT_DIR), { recursive: true })
	writeFileSync(path, source)
	return true
}

// Every file under `dir`, relative to it with forward slashes, in UTF-16 code unit order. A missing dir has none.
function filesUnder(dir: string): string[] {
	if (!existsSync(dir)) return []
	return readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"))
		.sort()
}

// What the watch needs of Vite's dev server.
export type WatchedServer = {
	watcher: { on(event: "all", listener: (event: string, path: string) => void): unknown }
	config: { logger: { error(message: string): void; info(message: string): void } }
}

// `vite dev` writes the files again after a short debounce when a source under src changes, each route file's id
// string first. A failure is reported and does not end the process. The generated files themselves are not sources.
export function watchGenerated(server: WatchedServer, root: string, delay = 50): void {
	const src = join(root, "src") + sep
	const out = join(root, OUT_DIR) + sep
	let timer: ReturnType<typeof setTimeout> | undefined
	server.watcher.on("all", (_event, path) => {
		if (!path.startsWith(src) || path.startsWith(out)) return
		clearTimeout(timer)
		timer = setTimeout(() => {
			try {
				writeGenerated(root, { fixIds: true, log: (line) => server.config.logger.info(line) })
			} catch (error) {
				server.config.logger.error(`[flare:codegen] ${String(error)}`)
			}
		}, delay)
	})
}
