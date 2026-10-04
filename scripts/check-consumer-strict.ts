#!/usr/bin/env bun
/**
 * Typecheck Flare the way consumers compile it: the packed tarball (not the
 * workspace link), strict consumer compiler flags, non-default entry names.
 *
 * Two apps:
 * - full: every peer installed, every public export path imported.
 * - minimal: the app entries a typical app has, without the optional peers that back features it
 *   does not use. Flare ships TypeScript source, so a consumer's tsc reads every module on that
 *   path; a feature peer imported there fails an app that never installed it.
 *
 *   bun run typecheck:consumer-strict
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const CORE = join(ROOT, "packages/core");
const FIXTURE = join(import.meta.dir, "consumer-strict");

interface PackageJson {
	exports: Record<string, string | Record<string, string>>;
	peerDependencies: Record<string, string>;
	workspaces: { catalog: Record<string, string> };
}

function readJson(path: string): PackageJson {
	return JSON.parse(readFileSync(path, "utf-8")) as PackageJson;
}

function run(cmd: string[], cwd: string): void {
	const proc = Bun.spawnSync(cmd, { cwd, stderr: "inherit", stdout: "inherit" });
	if (proc.exitCode !== 0) {
		throw new Error(`${cmd.join(" ")} failed in ${cwd} (exit ${proc.exitCode})`);
	}
}

const core = readJson(join(CORE, "package.json"));
const catalog = readJson(join(ROOT, "package.json")).workspaces.catalog;

function catalogVersion(name: string): string {
	const version = catalog[name];
	if (!version) throw new Error(`root catalog has no version for ${name}`);
	return version;
}

/* Every public export path (one match per wildcard); ambient `.d.ts` entries are reached through the generated types reference. */
function exportPaths(): string[] {
	return Object.entries(core.exports)
		.filter(([, target]) => typeof target !== "string" || !target.endsWith(".d.ts"))
		.map(([key, target]) => {
			if (!key.includes("*") || typeof target !== "string") return `@lovrozagar/flare${key.slice(1)}`;
			const pattern = target.replace(/^\.\//, "");
			const [first] = [...new Bun.Glob(pattern).scanSync({ cwd: CORE })].sort();
			if (!first) throw new Error(`export ${key} (${target}) matches no files`);
			const [prefix = "", suffix = ""] = pattern.split("*");
			const stem = first.slice(prefix.length, first.length - suffix.length);
			return `@lovrozagar/flare${key.slice(1).replace("*", stem)}`;
		});
}

function checkApp(work: string, name: string, peers: string[], paths: string[]): void {
	const app = join(work, name);
	cpSync(FIXTURE, app, { recursive: true });

	const dependencies: Record<string, string> = { "@lovrozagar/flare": `file:${join(work, "flare.tgz")}` };
	for (const dep of [...peers, "@types/node", "typescript"]) {
		dependencies[dep] = catalogVersion(dep);
	}
	writeFileSync(
		join(app, "package.json"),
		JSON.stringify({ dependencies, name: `flare-consumer-${name}`, private: true, type: "module" }, null, "\t"),
	);
	if (paths.length > 0) {
		writeFileSync(
			join(app, "src/exports.ts"),
			`${paths.map((p, i) => `import * as e${i} from "${p}";`).join("\n")}\n\nexport const flareExports = [${paths.map((_, i) => `e${i}`).join(", ")}];\n`,
		);
	}

	run(["bun", "install"], app);
	mkdirSync(join(app, "src"), { recursive: true });
	writeFileSync(
		join(app, "codegen.ts"),
		`import { flare } from "@lovrozagar/flare/plugins";
const plugin = flare({
	codegen: { fsVirtualPaths: false },
	entry: { client: "src/app.client.tsx", server: "src/app.server.ts" },
}).find(
	(p) => p.name === "flare:generate",
);
(plugin?.buildStart as (this: unknown) => void).call({ environment: { config: { root: process.cwd() } } });
`,
	);
	run(["bun", "run", "codegen.ts"], app);
	run(["bun", "x", "tsc", "--noEmit", "-p", "."], app);
}

/* Optional peers behind opt-in features (cross-tab query sync, i18n middleware, content negotiation,
 * markdown responses, images). The fixture uses none of them. */
const FEATURE_PEERS = new Set([
	"@formatjs/intl-localematcher",
	"@tanstack/query-broadcast-client-experimental",
	"isbot",
	"negotiator",
	"node-html-markdown",
	"sharp",
]);

const work = mkdtempSync(join(tmpdir(), "flare-consumer-strict-"));
try {
	/* npm pack, like the release workflow's npm publish: bun pack would hide unresolved catalog: specifiers. */
	run(["npm", "pack", "--pack-destination", work, "--silent"], CORE);
	const [tarball] = [...new Bun.Glob("*.tgz").scanSync({ cwd: work })];
	if (!tarball) throw new Error("npm pack produced no tarball");
	renameSync(join(work, tarball), join(work, "flare.tgz"));

	const allPeers = Object.keys(core.peerDependencies);
	const minimalPeers = allPeers.filter((name) => !FEATURE_PEERS.has(name));

	const paths = exportPaths();
	checkApp(work, "full", allPeers, paths);
	console.log(`consumer-strict: ${paths.length} export paths typecheck under strict consumer flags`);

	checkApp(work, "minimal", minimalPeers, []);
	console.log(`consumer-strict: an app without feature peers (${[...FEATURE_PEERS].join(", ")}) typechecks`);
} finally {
	/* FLARE_CONSUMER_KEEP=1 leaves the temp app for debugging. */
	if (process.env.FLARE_CONSUMER_KEEP) console.log(`kept ${work}`);
	else rmSync(work, { force: true, recursive: true });
}
