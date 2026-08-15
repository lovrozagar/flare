import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import type { RouteDefinition } from "../../generators/index.ts";
import { scanSourceFiles } from "../../generators/index.ts";
import type { LocaleMatch } from "../../router-primitives/tree.ts";
import type { FlarePluginConfig, VitePlugin } from "../index.ts";
import { extractLocaleMatchFromModule } from "./match-route-tree.ts";

/* ── Types ───────────────────────────────────────────────────────────── */

export interface RouteTreeNode {
	auth: false | "optional" | true;
	cache: RouteDefinition["cache"];
	children: RouteTreeNode[];
	filePath: string | null;
	hasInput: boolean;
	intercept?: RouteDefinition["intercept"];
	responseRoute: boolean;
	segment: string;
	type: RouteDefinition["type"] | "segment";
	urlPath: string;
	virtualPath: string | null;
}

interface ServerFnInfo {
	authenticate: boolean;
	file: string;
	id: string;
	method: string;
	name: string;
	stream: boolean;
}

/* ── Route tree builder ──────────────────────────────────────────────── */

function virtualPathToUrlPath(virtualPath: string): string {
	const parts = virtualPath.split("/");
	const rootIdx = parts.findIndex((p) => p.startsWith("_") && p.endsWith("_") && p.length >= 3);
	const urlParts: string[] = [];

	for (let i = 0; i < parts.length; i++) {
		const part = parts[i] ?? "";
		if (rootIdx >= 0 && i <= rootIdx) continue;
		if (part.startsWith("(") && part.endsWith(")")) continue;
		if (part === "") continue;
		urlParts.push(part);
	}

	return `/${urlParts.join("/")}`;
}

function virtualPathToSegments(virtualPath: string): string[] {
	const parts = virtualPath.split("/");
	const rootIdx = parts.findIndex((p) => p.startsWith("_") && p.endsWith("_") && p.length >= 3);
	const segments: string[] = [];

	for (let i = 0; i < parts.length; i++) {
		const part = parts[i] ?? "";
		if (rootIdx >= 0 && i <= rootIdx) continue;
		if (part === "") continue;
		segments.push(part);
	}

	return segments;
}

function emptyNode(segment: string, urlPath: string): RouteTreeNode {
	return {
		auth: false,
		cache: {},
		children: [],
		filePath: null,
		hasInput: false,
		responseRoute: false,
		segment,
		type: "segment",
		urlPath,
		virtualPath: null,
	};
}

function applyDef(node: RouteTreeNode, def: RouteDefinition, preserveType?: boolean): void {
	node.auth = def.authenticateMode;
	node.cache = def.cache;
	node.filePath = def.filePath;
	node.hasInput = def.hasInput;
	node.intercept = def.intercept;
	node.responseRoute = def.responseRoute;
	node.urlPath = virtualPathToUrlPath(def.virtualPath);
	node.virtualPath = def.virtualPath;
	if (preserveType) {
		if (node.type === "segment") node.type = def.type;
	} else {
		node.type = def.type;
	}
}

export function buildRouteTree(defs: RouteDefinition[]): RouteTreeNode[] {
	const root = emptyNode("", "/");

	for (const def of defs) {
		if (def.type === "root-layout") {
			applyDef(root, def);
			continue;
		}

		const segments = virtualPathToSegments(def.virtualPath);

		if (segments.length === 0) {
			const idx = emptyNode("/", "/");
			applyDef(idx, def);
			root.children.push(idx);
			continue;
		}

		let current = root;
		let accUrl = "";

		for (const seg of segments) {
			const isGroup = seg.startsWith("(") && seg.endsWith(")");
			if (!isGroup) accUrl += `/${seg}`;

			let child = current.children.find((c) => c.segment === seg);
			if (!child) {
				child = emptyNode(seg, isGroup ? current.urlPath : accUrl || "/");
				current.children.push(child);
			}

			current = child;
		}

		applyDef(current, def, def.type === "layout");
	}

	function sortTree(node: RouteTreeNode): void {
		node.children.sort((a, b) => a.segment.localeCompare(b.segment));
		for (const child of node.children) sortTree(child);
	}
	sortTree(root);

	return root.children.length > 0 || root.type !== "segment" ? [root] : [];
}

/* ── Data collection ─────────────────────────────────────────────────── */

function collectRouteDefs(root: string, ignorePrefix: string): RouteDefinition[] {
	return scanSourceFiles({ ignorePrefix, rootDir: root });
}

function collectRouteTree(root: string, ignorePrefix: string): RouteTreeNode[] {
	const defs = scanSourceFiles({ ignorePrefix, rootDir: root });
	return buildRouteTree(defs);
}

async function collectServerFns(
	ssrRunner: { import: (id: string) => Promise<Record<string, unknown>> } | undefined,
): Promise<ServerFnInfo[]> {
	if (!ssrRunner) return [];

	try {
		const mod = await ssrRunner.import("virtual:flare-server-fn-map");
		const map = (mod.default ?? mod) as Map<string, Record<string, unknown>> | undefined;
		if (!map || typeof map.entries !== "function") return [];

		const fns: ServerFnInfo[] = [];
		const seen = new Set<string>();

		for (const [, reg] of map) {
			const id = String(reg.id ?? "");
			if (seen.has(id)) continue;
			seen.add(id);

			fns.push({
				authenticate: Boolean(reg.authenticate),
				file: String(reg.file ?? ""),
				id,
				method: String(reg.method ?? "post"),
				name: String(reg.name ?? id),
				stream: Boolean(reg.stream),
			});
		}

		return fns.sort((a, b) => a.name.localeCompare(b.name));
	} catch {
		return [];
	}
}

const ROUTER_CANDIDATES = ["src/router.ts", "src/router.tsx"] as const;

export async function collectLocaleMatch(
	ssrRunner: { import: (id: string) => Promise<Record<string, unknown>> } | undefined,
	root: string,
): Promise<LocaleMatch | undefined> {
	if (!ssrRunner) return undefined;

	for (const rel of ROUTER_CANDIDATES) {
		if (!existsSync(join(root, rel))) continue;
		try {
			const mod = await ssrRunner.import(`./${rel}`);
			const match = extractLocaleMatchFromModule(mod);
			if (match) return match;
		} catch {
			/* try next candidate */
		}
	}
	return undefined;
}

/* ── Builder chain extraction ─────────────────────────────────────────── */

const BUILDER_METHODS = new Set([
	"authenticate",
	"authenticateOptional",
	"authorize",
	"cache",
	"effects",
	"errorRender",
	"head",
	"headers",
	"input",
	"intercept",
	"loader",
	"notFoundRender",
	"preloader",
	"render",
	"response",
	"unauthenticatedRender",
	"unauthorizedRender",
]);

function extractBuilderChains(root: string, defs: RouteDefinition[]): Record<string, string[]> {
	const result: Record<string, string[]> = {};

	for (const def of defs) {
		try {
			const content = readFileSync(join(root, def.filePath), "utf-8");
			const methods: string[] = [];
			const seen = new Set<string>();

			const re = /\.(\w+)\s*\(/g;
			let match = re.exec(content);
			while (match) {
				const name = match[1] ?? "";
				if (BUILDER_METHODS.has(name) && !seen.has(name)) {
					seen.add(name);
					methods.push(name);
				}
				match = re.exec(content);
			}

			result[def.filePath] = methods;
		} catch {
			result[def.filePath] = [];
		}
	}

	return result;
}

/* ── Plugin ──────────────────────────────────────────────────────────── */

interface DashboardRes {
	end: (data?: unknown) => void;
	writeHead: (status: number, headers?: Record<string, string>) => void;
}

interface DashboardDevServer {
	config?: { root?: string };
	environments?: Record<string, { runner?: { import: (id: string) => Promise<Record<string, unknown>> } }>;
	middlewares: {
		use: (
			fn: (
				req: {
					headers: Record<string, string | string[] | undefined>;
					method?: string;
					url?: string;
				},
				res: DashboardRes,
				next: () => void,
			) => void,
		) => void;
	};
}

const VIRTUAL_ID = "virtual:flare-devtools";
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;

function resolveClientFilePath(): string {
	try {
		const req = createRequire(import.meta.url);
		const pluginsPath = req.resolve("@lovrozagar/flare/plugins");
		return join(dirname(pluginsPath), "dev-dashboard", "client.tsx").replace(/\\/g, "/");
	} catch {
		/* Fallback: resolve relative to this file */
		return join(dirname(import.meta.url.replace("file://", "")), "client.tsx").replace(/\\/g, "/");
	}
}

export function createDevDashboardPlugin(config: FlarePluginConfig): VitePlugin {
	const ignorePrefix = config.ignorePrefix ?? "_";
	let clientFilePath = "";

	return {
		buildStart() {
			if (!clientFilePath) {
				clientFilePath = resolveClientFilePath();
			}
		},
		configureServer(server: unknown) {
			const vite = server as DashboardDevServer;
			const root = vite.config?.root ?? process.cwd();

			vite.middlewares.use(async (req, res, next) => {
				if (!req.url?.startsWith("/__flare/")) return next();

				if (req.url.startsWith("/__flare/open-editor?")) {
					const params = new URL(req.url, "http://localhost").searchParams;
					const file = params.get("file");
					if (file) {
						const filePath = resolve(join(root, file));
						const rootWithSlash = root.endsWith("/") ? root : `${root}/`;
						if (filePath.startsWith(rootWithSlash)) {
							import("node:child_process")
								.then(({ execFile }) => {
									execFile("code", ["--goto", filePath], () => {});
								})
								.catch(() => {});
						}
					}
					res.writeHead(204);
					res.end();
					return;
				}

				if (!req.url.startsWith("/__flare/api")) return next();

				try {
					const ssrRunner = vite.environments?.ssr?.runner;
					const defs = collectRouteDefs(root, ignorePrefix);
					const routeTree = collectRouteTree(root, ignorePrefix);
					const serverFunctions = await collectServerFns(ssrRunner);
					const builderChains = extractBuilderChains(root, defs);
					const localeMatch = await collectLocaleMatch(ssrRunner, root);

					res.writeHead(200, {
						"access-control-allow-origin": "*",
						"content-type": "application/json",
					});
					res.end(JSON.stringify({ builderChains, defs, localeMatch, routeTree, serverFunctions }, null, 2));
				} catch (e: unknown) {
					const msg = e instanceof Error ? e.message : String(e);
					res.writeHead(500, { "content-type": "application/json" });
					res.end(JSON.stringify({ error: msg }));
				}
			});

			return undefined;
		},
		enforce: "pre",
		load(id: string): { code: string; moduleType: string } | null {
			if (id !== RESOLVED_VIRTUAL_ID) return null;

			if (!clientFilePath) {
				clientFilePath = resolveClientFilePath();
			}

			if (!clientFilePath) {
				return {
					code: "/* flare devtools: unable to resolve client module */",
					moduleType: "js",
				};
			}

			return {
				code: `import { mount } from "${clientFilePath}"\nmount()`,
				moduleType: "js",
			};
		},
		name: "flare:dev-dashboard",
		resolveId(id: string) {
			if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
			return null;
		},
		transformIndexHtml(html: string) {
			const nonceMatch = html.match(/nonce="([^"]*)"/);
			const nonce = nonceMatch?.[1];

			if (clientFilePath) {
				return [
					{
						attrs: { type: "module", ...(nonce ? { nonce } : {}) },
						children: `import("/@fs${clientFilePath}").then(m => m.mount())`,
						injectTo: "body" as const,
						tag: "script",
					},
				];
			}

			return [];
		},
	};
}
