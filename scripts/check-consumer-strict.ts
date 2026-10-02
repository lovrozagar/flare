#!/usr/bin/env bun
/**
 * Typecheck Flare the way consumers compile it: the packed tarball (not the
 * workspace link), strict consumer compiler flags, non-default entry names,
 * and every public export path imported.
 *
 *   bun run typecheck:consumer-strict
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

const work = mkdtempSync(join(tmpdir(), "flare-consumer-strict-"));
try {
	run(["bun", "pm", "pack", "--filename", join(work, "flare.tgz"), "--quiet"], CORE);

	const app = join(work, "app");
	cpSync(FIXTURE, app, { recursive: true });

	const dependencies: Record<string, string> = { "@lovrozagar/flare": `file:${join(work, "flare.tgz")}` };
	for (const name of [...Object.keys(core.peerDependencies), "@types/node", "typescript"]) {
		dependencies[name] = catalogVersion(name);
	}
	writeFileSync(
		join(app, "package.json"),
		JSON.stringify({ dependencies, name: "flare-consumer-strict", private: true, type: "module" }, null, "\t"),
	);

	/* Every public export path (one match per wildcard); ambient `.d.ts` entries are reached through the generated types reference. */
	const paths = Object.entries(core.exports)
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
	writeFileSync(
		join(app, "src/exports.ts"),
		`${paths.map((p, i) => `import * as e${i} from "${p}";`).join("\n")}\n\nexport const flareExports = [${paths.map((_, i) => `e${i}`).join(", ")}];\n`,
	);

	run(["bun", "install"], app);
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
	console.log(`consumer-strict: ${paths.length} export paths typecheck under strict consumer flags`);
} finally {
	/* FLARE_CONSUMER_KEEP=1 leaves the temp app for debugging. */
	if (process.env.FLARE_CONSUMER_KEEP) console.log(`kept ${work}`);
	else rmSync(work, { force: true, recursive: true });
}
