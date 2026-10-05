/**
 * retainPreviousAssets: before a deploy replaces the site, copy recently used hashed files from
 * the live site (`site`) into this build's client output, so pages from earlier builds — open
 * tabs, HTML still cached by a CDN — keep finding their chunks. Host-agnostic: it only reads the
 * public site over HTTP.
 *
 * The site publishes `<assetsBase>/_flare-asset-history.json`: every file the last builds
 * shipped and when each was last part of a build. Retained: every file of the build being
 * replaced, plus files last shipped within the window. Runs after the client build, so retained
 * files never enter the manifest, build id, preloads or prefetch list.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { type Duration, parseSeconds } from "../duration/index.ts";
import { type RouteDefinition, scanSourceFiles } from "../generators/index.ts";
import type { ViteManifest } from "../module-graph/index.ts";
import { buildIdFromManifest, findClientDir, readClientManifest } from "./build-id.ts";
import type { VitePlugin } from "./types.ts";

export const ASSET_HISTORY_FILE = "_flare-asset-history.json";

export interface AssetHistory {
	/** The build that wrote this history (the one a new deploy replaces). */
	current: { at: number; id: string };
	/** Every retained or shipped file → the last build that included it and when. */
	files: Record<string, { at: number; build: string }>;
	v: 1;
}

/** Every hashed file the client build emitted: chunks, CSS, imported assets. */
export function manifestFiles(manifest: ViteManifest): string[] {
	const files = new Set<string>();
	for (const entry of Object.values(manifest)) {
		if (entry.file) files.add(`/${entry.file}`);
		for (const f of entry.css ?? []) files.add(`/${f}`);
		for (const f of entry.assets ?? []) files.add(`/${f}`);
	}
	return [...files];
}

export function selectRetainedAssets(options: {
	currentFiles: string[];
	history: AssetHistory;
	now: number;
	windowMs: number;
}): string[] {
	const current = new Set(options.currentFiles);
	const replaced = options.history.current.id;
	return Object.entries(options.history.files)
		.filter(([path, f]) => !current.has(path) && (f.build === replaced || options.now - f.at <= options.windowMs))
		.map(([path]) => path);
}

export function nextAssetHistory(options: {
	buildId: string;
	currentFiles: string[];
	history?: AssetHistory;
	now: number;
	retained: string[];
}): AssetHistory {
	const files: AssetHistory["files"] = {};
	for (const path of options.retained) {
		const previous = options.history?.files[path];
		if (previous) files[path] = previous;
	}
	for (const path of options.currentFiles) files[path] = { at: options.now, build: options.buildId };
	return { current: { at: options.now, id: options.buildId }, files, v: 1 };
}

/**
 * `true`: the longest HTML lifetime routes declare (`cdn.maxAge + swr`) — how long a cached page
 * from the old build can still be served. Routes whose lifetime codegen cannot read are reported.
 * A duration overrides it.
 */
export function retentionWindow(
	defs: RouteDefinition[],
	option: true | Duration,
): { unknown: string[]; windowMs: number } {
	if (option !== true) return { unknown: [], windowMs: parseSeconds(option) * 1000 };
	let longest = 0;
	const unknown: string[] = [];
	for (const def of defs) {
		if (def.cache.cdnLifetimeUnknown) unknown.push(def.virtualPath);
		else if (def.cache.cdnLifetime !== undefined) longest = Math.max(longest, def.cache.cdnLifetime);
	}
	return { unknown, windowMs: longest * 1000 };
}

/** `fetch failed` hides the reason in `cause` (ECONNREFUSED, ENOTFOUND, …). */
function describeError(e: unknown): string {
	if (!(e instanceof Error)) return String(e);
	const cause = e.cause as { code?: string; message?: string } | undefined;
	return cause ? `${e.message}: ${cause.code ?? cause.message}` : e.message;
}

/** A history path we may fetch from the site and write into the client output. */
function safeAssetPath(path: string, assetsBase: string): boolean {
	if (!path.startsWith(`${assetsBase}/`) || path.includes("\\") || path.includes("\0")) return false;
	let decoded: string;
	try {
		decoded = decodeURIComponent(path);
	} catch {
		return false;
	}
	return !decoded.split("/").includes("..");
}

async function fetchHistory(site: string, assetsBase: string, now: number): Promise<AssetHistory | "missing"> {
	/* Unique query + no-store: a CDN in front of the site must not answer with an old list. */
	const url = new URL(`${assetsBase}/${ASSET_HISTORY_FILE}?t=${now}`, site);
	const res = await fetch(url, { cache: "no-store" });
	if (res.status === 404) return "missing";
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const history = (await res.json()) as AssetHistory;
	if (history?.v !== 1 || typeof history.files !== "object") throw new Error("unrecognized history format");
	return history;
}

export async function retainPreviousAssets(options: {
	assetsBase: string;
	now?: number;
	root: string;
	site: string;
	windowMs: number;
}): Promise<{ bytes: number; failed: number; retained: number }> {
	const now = options.now ?? Date.now();
	const manifest = readClientManifest(options.root);
	const clientDir = findClientDir(options.root);
	if (!manifest || !clientDir) return { bytes: 0, failed: 0, retained: 0 };
	const currentFiles = manifestFiles(manifest);
	const buildId = buildIdFromManifest(manifest);

	let history: AssetHistory | undefined;
	try {
		const fetched = await fetchHistory(options.site, options.assetsBase, now);
		if (fetched === "missing")
			console.log(`[flare:retain] no previous asset history at ${options.site}, starting fresh`);
		else history = fetched;
	} catch (e) {
		console.warn(
			`[flare:retain] could not read the asset history from ${options.site} (${describeError(e)}); nothing retained this build`,
		);
	}

	const selected = history
		? selectRetainedAssets({ currentFiles, history, now, windowMs: options.windowMs }).filter((p) =>
				safeAssetPath(p, options.assetsBase),
			)
		: [];
	const root = resolve(clientDir);
	const retained: string[] = [];
	let bytes = 0;
	let failed = 0;
	await Promise.all(
		selected.map(async (path) => {
			const target = resolve(root, `.${path}`);
			if (!target.startsWith(root + sep)) return;
			try {
				const res = await fetch(new URL(path, options.site));
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const body = new Uint8Array(await res.arrayBuffer());
				mkdirSync(dirname(target), { recursive: true });
				writeFileSync(target, body);
				bytes += body.byteLength;
				retained.push(path);
			} catch (e) {
				failed++;
				console.warn(`[flare:retain] could not retain ${path} (${describeError(e)})`);
			}
		}),
	);

	const next = nextAssetHistory({ buildId, currentFiles, history, now, retained });
	const historyPath = join(clientDir, options.assetsBase, ASSET_HISTORY_FILE);
	mkdirSync(dirname(historyPath), { recursive: true });
	writeFileSync(historyPath, JSON.stringify(next), "utf-8");
	return { bytes, failed, retained: retained.length };
}

export function createRetainAssetsPlugin(config: {
	assetsBase: string;
	ignorePrefix: string;
	option: true | Duration;
	site: string;
}): VitePlugin {
	return {
		async closeBundle(this: { environment?: { config?: { root?: string }; name?: string } }): Promise<void> {
			if (this.environment?.name !== "client") return;
			const root = this.environment.config?.root ?? process.cwd();
			const defs = scanSourceFiles({ ignorePrefix: config.ignorePrefix, rootDir: root });
			const { unknown, windowMs } = retentionWindow(defs, config.option);
			if (unknown.length > 0) {
				console.warn(
					`[flare:retain] cache lifetime of ${unknown.join(", ")} is set at runtime; retaining the previous build only. Pass retainPreviousAssets: "<duration>" to cover it.`,
				);
			}
			const result = await retainPreviousAssets({ assetsBase: config.assetsBase, root, site: config.site, windowMs });
			console.log(
				`[flare:retain] retained ${result.retained} file(s), ${Math.round(result.bytes / 1024)} KiB (previous build + ${Math.round(windowMs / 3_600_000)}h window)${result.failed ? `, ${result.failed} failed` : ""}`,
			);
		},
		name: "flare:retain-assets",
	};
}
