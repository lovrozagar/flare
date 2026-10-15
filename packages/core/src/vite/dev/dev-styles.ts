import { readFileSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { STYLES_EVENT, stylesRequest, type DevStyle } from "../../shared/protocol/index.ts"
import { generateRoutes } from "../codegen/routes.ts"
import { routeFilesOf } from "../codegen/write.ts"

const ROUTES_DIR = "src/routes"
const CSS = /\.css($|\?)/

// A module in a server environment's graph, as much of it as the walk reads.
export type GraphNode = { id: string | null; url: string; importedModules: Set<GraphNode> }

type HotClient = { send(event: string, payload: unknown): void }

// The server environment the dev styles answer on: ssr, which runs in workerd under the Cloudflare plugin (B109).
export type StylesEnvironment = {
	hot: { on(event: string, listener: (payload: unknown, client: HotClient) => void): void }
	moduleGraph: { getModulesByFile(file: string): Set<GraphNode> | undefined }
}

// The client environment, as much of it as the dev styles read and transform.
export type StylesClient = {
	transformRequest(url: string): Promise<{ code: string } | null>
	moduleGraph: {
		getModulesByFile(file: string): Set<GraphNode> | undefined
		ensureEntryFromUrl(url: string, setIsSelfAccepting: boolean): Promise<unknown>
	}
}

// What the dev styles need of Vite's dev server.
export type StylesServer = {
	config: { root: string }
	watcher: { on(event: "all", listener: () => void): unknown }
	environments: { client: StylesClient; ssr?: StylesEnvironment }
}

// The dev server's answer to `flare:styles` (B104): the CSS modules the client entry imports itself (flare's reset,
// an app's global CSS), then every CSS module the matched chain's route files import, in import order and once each,
// with the CSS Vite serves for it (`?direct`, so Tailwind comes out compiled). One walk per chain: the answer is
// cached until any watched file changes, which every HMR update and full reload follows. `entry` is the client
// entry's absolute path.
export function installDevStyles(server: StylesServer, entry: string): void {
	const cache = new Map<string, Promise<DevStyle[]>>()
	let files: Map<string, string> | undefined
	server.watcher.on("all", () => {
		cache.clear()
		files = undefined
	})
	const fileOf = (route: string): string | undefined => {
		files ??= routeFileMap(server.config.root)
		return files.get(route)
	}
	const environment = server.environments.ssr
	environment?.hot.on(STYLES_EVENT, (payload, client) => {
		const asked = stylesRequest(payload)
		if (asked === undefined) return
		const key = asked.routes.join("\n")
		const styles = cache.get(key) ?? stylesOf(server, environment, { entry, files: asked.routes.map(fileOf) })
		cache.set(key, styles)
		const answer = (list: DevStyle[]): void => client.send(STYLES_EVENT, { request: asked.request, styles: list })
		styles.then(answer, () => {
			cache.delete(key)
			answer([])
		})
	})
}

// Route id to its file's absolute path, from the same scan the route codegen runs.
function routeFileMap(root: string): Map<string, string> {
	const dir = join(root, ROUTES_DIR)
	const generated = generateRoutes(routeFilesOf(root), (file) => readFileSync(join(dir, file), "utf8"))
	return new Map([...generated.layouts, ...generated.routes].map((entry) => [entry.id, join(dir, entry.file)]))
}

async function stylesOf(
	server: StylesServer,
	environment: StylesEnvironment,
	chain: { entry: string; files: readonly (string | undefined)[] },
): Promise<DevStyle[]> {
	const seen = new Set<string>()
	const found: GraphNode[] = []
	const walk = (node: GraphNode): void => {
		if (node.id === null || seen.has(node.id)) return
		seen.add(node.id)
		if (CSS.test(node.id)) found.push(node)
		for (const next of node.importedModules) walk(next)
	}
	// The client entry's own CSS imports, which no route imports. Transforming the entry records them in the graph.
	const client = server.environments.client
	await client.transformRequest(`/${relative(server.config.root, chain.entry).split(sep).join("/")}`)
	for (const node of client.moduleGraph.getModulesByFile(chain.entry) ?? []) {
		for (const next of node.importedModules) if (next.id !== null && CSS.test(next.id)) walk(next)
	}
	for (const file of chain.files) {
		if (file !== undefined) for (const node of environment.moduleGraph.getModulesByFile(file) ?? []) walk(node)
	}
	return Promise.all(found.map(async (node) => ({ id: String(node.id), css: await directStyle(client, node.url) })))
}

// The CSS Vite serves for a stylesheet (`?direct`, so Tailwind comes out compiled). The module is entered unanalyzed
// first: one that `transformRequest` enters is not self-accepting until its transform ends, so an edit of the file
// before then, as during a first Tailwind compile, met a dead end and sent every client a full reload. Unanalyzed, the
// update stops at it, and the page's own stylesheet module takes the edit (BUGS.md 111).
export async function directStyle(client: StylesClient, url: string): Promise<string> {
	const direct = `${url}${url.includes("?") ? "&" : "?"}direct`
	await client.moduleGraph.ensureEntryFromUrl(direct, false)
	return (await client.transformRequest(direct))?.code ?? ""
}
