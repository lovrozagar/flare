import { readFile } from "node:fs/promises"
import type { IncomingMessage, ServerResponse } from "node:http"
import { resolve } from "node:path"
import type { Plugin } from "vite"
import { emitFonts, fontFile, fontRegistry } from "../../features/fonts/vite/index.ts"

// A registry family module, from source in the workspace or compiled in the installed package (B78).
const GENERATED = /features\/fonts\/shared\/generated\/([a-z0-9-]+)\.(?:ts|js)$/

// The families among the client build's modules, by the generated modules it loaded.
function familiesOf(ids: Iterable<string>): string[] {
	const families = new Set<string>()
	for (const id of ids) {
		const family = GENERATED.exec(id.replaceAll("\\", "/"))?.[1]
		if (family !== undefined) families.add(family)
	}
	return [...families].toSorted()
}

// Every registry file url. Dev serves any of them, since it has no bundle to read the used families from.
const REGISTRY_URLS = new Set(Object.values(fontRegistry).flatMap((family) => family.files.map((file) => file.url)))

// `vite dev` answers a registry url from `dir`. Anything else, a missing file included, is the app's: its own
// `public/fonts` or its 404 (dx/plugin.md fonts, BUGS.md B7).
function fontMiddleware(
	source: string,
): (req: IncomingMessage, res: ServerResponse, next: () => void) => Promise<void> {
	return async (req, res, next) => {
		const url = (req.url ?? "").replace(/\?.*$/s, "")
		const path = req.method === "GET" || req.method === "HEAD" ? fontFile(source, url) : undefined
		if (path === undefined || !REGISTRY_URLS.has(url)) return next()
		let bytes: Uint8Array
		try {
			bytes = await readFile(path)
		} catch {
			return next()
		}
		res.statusCode = 200
		res.setHeader("content-type", "font/woff2")
		res.setHeader("cache-control", "no-cache")
		res.end(req.method === "HEAD" ? undefined : bytes)
	}
}

// `flare({ fonts: { dir } })` (dx/plugin.md fonts): the client build emits only the used families' woff2 files from
// `dir`, at their registry url. A missing file fails the build and names it. `vite dev` serves the same urls.
export function fontsPlugin(dir: string): Plugin {
	return {
		name: "flare:fonts",
		configureServer(server) {
			server.middlewares.use(fontMiddleware(resolve(server.config.root, dir)))
		},
		applyToEnvironment: (environment) => environment.name === "client",
		async generateBundle() {
			await emitFonts({
				registry: fontRegistry,
				families: familiesOf(this.getModuleIds()),
				source: resolve(this.environment.config.root, dir),
				emit: (file) => void this.emitFile({ type: "asset", fileName: file.fileName, source: file.source }),
			})
		},
	}
}
