import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const CORE = join(REPO, "packages/core");
// Stages live under the repo's node_modules, so an app staged there resolves the peers an install would (B70, G2).
const STAGES = join(REPO, "node_modules/.flare-e2e");

type Manifest = Record<string, unknown>;

// A packed tarball, installed into a stage: `root` is `<stage>/node_modules/@lovrozagar/flare`.
export type Packed = {
	stage: string;
	root: string;
	tarball: string;
	entries: string[];
	manifest: Manifest;
	close: () => void;
};

// The packager the bits/14 spike chose: tsdown passed the whole contract, and tsc did not copy the image module types.
export function buildDist(out: string): void {
	const tsdown = join(REPO, "node_modules/.bin/tsdown");
	execFileSync(tsdown, ["--config", join(CORE, "tsdown.config.ts"), "--out-dir", out, "--log-level", "error"], {
		cwd: CORE,
		stdio: "pipe",
	});
}

function compiled(path: string, extension: ".js" | ".d.ts"): string {
	return path.replace(/^\.\/src\//, "./dist/").replace(/\.tsx?$/, extension);
}

// One entry's conditions: `types` and `default` from dist. An entry whose conditions name different files keeps them
// all, in order, because the first matching key wins: only `./server-fn` has one (03-surface).
function entryOf(value: unknown): unknown {
	if (typeof value === "string") {
		return value === "./package.json" ? value : { types: compiled(value, ".d.ts"), default: compiled(value, ".js") };
	}
	const conditions: Record<string, string> = Object(value);
	const main = String(conditions.default);
	const out: Record<string, string> = { types: compiled(main, ".d.ts") };
	const split = Object.entries(conditions).some(([name, path]) => name !== "types" && path !== main);
	for (const [name, path] of Object.entries(conditions)) {
		if (name === "types" || (!split && name !== "default")) continue;
		out[name] = compiled(path, ".js");
	}
	return out;
}

// The manifest the tarball carries (G4): the workspace keeps `src` exports, the package points at `dist`.
export function publishManifest(source: Manifest): Manifest {
	const { scripts: _scripts, devDependencies: _dev, ...kept } = source;
	const exports = Object.fromEntries(
		Object.entries(Object(source.exports)).map(([key, value]) => [key, entryOf(value)]),
	);
	const bin = Object.fromEntries(
		Object.entries(Object(source.bin)).map(([name, path]) => [name, compiled(String(path), ".js")]),
	);
	return { ...kept, bin, exports, files: ["dist", "src", "README.md", "LICENSE"] };
}

// The package directory npm packs: dist, the non-test sources, the root README and LICENSE, and the rewritten manifest.
export function stagePackage(out: string): string {
	const dir = join(out, "package");
	mkdirSync(dir, { recursive: true });
	buildDist(join(dir, "dist"));
	cpSync(join(CORE, "src"), join(dir, "src"), { recursive: true, filter: (path) => !/\.test\.tsx?$/.test(path) });
	cpSync(join(REPO, "README.md"), join(dir, "README.md"));
	cpSync(join(REPO, "LICENSE"), join(dir, "LICENSE"));
	const source: Manifest = JSON.parse(readFileSync(join(CORE, "package.json"), "utf8"));
	writeFileSync(join(dir, "package.json"), `${JSON.stringify(publishManifest(source), null, "\t")}\n`);
	return dir;
}

export function packTarball(dir: string, out: string): string {
	const result = execFileSync("npm", ["pack", "--json", "--pack-destination", out], { cwd: dir, encoding: "utf8" });
	// npm 11+ keys the report by package name; older npm wrote an array.
	const report: unknown = JSON.parse(result);
	const [packed] = Array.isArray(report) ? report : Object.values(Object(report));
	return join(out, String(Reflect.get(Object(packed), "filename")));
}

// Extracting is the whole install for a package with no dependencies and no lifecycle scripts (G2).
export function installTarball(tarball: string, stage: string): string {
	const modules = join(stage, "node_modules");
	mkdirSync(join(modules, "@lovrozagar"), { recursive: true });
	execFileSync("tar", ["-xzf", tarball, "-C", modules]);
	const root = join(modules, "@lovrozagar/flare");
	renameSync(join(modules, "package"), root);
	mkdirSync(join(modules, ".bin"), { recursive: true });
	symlinkSync("../@lovrozagar/flare/dist/vite/bin/flare.js", join(modules, ".bin/flare"));
	return root;
}

export function packCore(): Packed {
	mkdirSync(STAGES, { recursive: true });
	const stage = mkdtempSync(join(STAGES, "pack-"));
	const close = (): void => rmSync(stage, { recursive: true, force: true });
	try {
		const tarball = packTarball(stagePackage(join(stage, "build")), stage);
		const entries = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" }).split("\n").filter(Boolean);
		const root = installTarball(tarball, stage);
		const manifest: Manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
		return { stage, root, tarball, entries, manifest, close };
	} catch (error) {
		close();
		throw error;
	}
}
