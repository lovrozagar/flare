/**
 * Build registry. Every production build a Flare app can be asked for,
 * paired with the artifacts that build must emit.
 *
 * A target is one (app, deploy target) pair. The runtime that *runs* the
 * build is orthogonal — see RUNTIME_IDS.
 */
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const RUNTIME_IDS = ["node", "bun", "deno"] as const;
export type RuntimeId = (typeof RUNTIME_IDS)[number];

export const TARGET_IDS = ["node", "workers", "nitro"] as const;
export type TargetId = (typeof TARGET_IDS)[number];

const e2eRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const appsRoot = join(e2eRoot, "apps");

export interface BuildSpec {
	/** e2e app directory name. */
	app: string;
	/** Vite config, relative to the app. Omitted means the default config. */
	config?: string;
	/** Paths, relative to the app, the build must emit. */
	expect: string[];
	/** `<app>×<target>`. */
	id: string;
	/** Paths, relative to the app, wiped before the build. */
	outDirs: string[];
	/** Runtimes that can run this build. */
	runtimes: RuntimeId[];
	/** Deploy target the build produces. */
	target: TargetId;
}

const CLIENT = ["dist/client/.vite/manifest.json"];
const SERVER = ["dist/server/server.js"];
const WORKER = [...SERVER, "dist/server/wrangler.json"];

/** Workers builds pull in @cloudflare/vite-plugin, which only loads under node. */
const NODE_ONLY: RuntimeId[] = ["node"];
const ALL_RUNTIMES: RuntimeId[] = [...RUNTIME_IDS];

export const BUILD_SPECS: BuildSpec[] = [
	{
		app: "product",
		expect: [...SERVER, ...CLIENT, "dist/client/sw.js", "dist/static/manifest.json"],
		id: "product×node",
		outDirs: ["dist"],
		runtimes: ALL_RUNTIMES,
		target: "node",
	},
	{
		app: "product",
		config: "vite.workers.config.ts",
		expect: [...WORKER, ...CLIENT, "dist/client/sw.js"],
		id: "product×workers",
		outDirs: ["dist"],
		runtimes: NODE_ONLY,
		target: "workers",
	},
	{
		app: "demo",
		expect: [...SERVER, ...CLIENT, "dist/client/sw.js"],
		id: "demo×node",
		outDirs: ["dist"],
		runtimes: ALL_RUNTIMES,
		target: "node",
	},
	{
		app: "demo",
		config: "vite.cf.config.ts",
		expect: [...WORKER, ...CLIENT, "dist/client/sw.js"],
		id: "demo×workers",
		outDirs: ["dist"],
		runtimes: NODE_ONLY,
		target: "workers",
	},
	{
		app: "fs-routes",
		expect: [...SERVER, ...CLIENT],
		id: "fs-routes×node",
		outDirs: ["dist", ".flare/cache"],
		runtimes: ALL_RUNTIMES,
		target: "node",
	},
	{
		app: "fs-routes",
		config: "vite.cf.config.ts",
		expect: [...WORKER, ...CLIENT],
		id: "fs-routes×workers",
		outDirs: ["dist", ".flare/cache"],
		runtimes: NODE_ONLY,
		target: "workers",
	},
	{
		app: "tauri",
		expect: [".output/server/index.mjs", ".output/public/.vite/manifest.json", ".output/nitro.json"],
		id: "tauri×nitro",
		outDirs: ["dist", ".output", ".nitro"],
		runtimes: ALL_RUNTIMES,
		target: "nitro",
	},
];

export function isRuntimeId(name: string): name is RuntimeId {
	return (RUNTIME_IDS as readonly string[]).includes(name);
}

export function isTargetId(name: string): name is TargetId {
	return (TARGET_IDS as readonly string[]).includes(name);
}

export function buildCwd(spec: BuildSpec): string {
	return join(appsRoot, spec.app);
}

/** Apps that ship a build spec — a superset check against what is on disk. */
export function knownBuildApps(): string[] {
	return [...new Set(BUILD_SPECS.map((spec) => spec.app))].sort();
}

export function missingBuildApps(): string[] {
	const onDisk = new Set(
		readdirSync(appsRoot, { withFileTypes: true })
			.filter((entry) => entry.isDirectory() && existsSync(join(appsRoot, entry.name, "package.json")))
			.map((entry) => entry.name),
	);
	return knownBuildApps().filter((app) => !onDisk.has(app));
}

export function buildCommand(spec: BuildSpec, runtime: RuntimeId): string[] {
	const cfg = spec.config ? ["--config", spec.config] : [];
	if (runtime === "deno") {
		return ["deno", "run", "-A", join(e2eRoot, "deno", "run-vite.ts"), "build", ...cfg];
	}
	if (runtime === "bun") {
		return ["bunx", "--bun", "vite", "build", ...cfg];
	}
	return ["bunx", "vite", "build", ...cfg];
}
