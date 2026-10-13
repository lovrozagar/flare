import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
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

// A source file that ships: not test code as files.tsv kinds it, a test or a test's fixture of any extension
// (00-rules Dependencies).
export function shipped(path: string): boolean {
	return !/\.(test\.tsx?|fixture\.[^/]+)$/.test(path);
}

// The package directory npm packs: dist, the non-test sources, the root README and LICENSE, and the rewritten manifest.
export function stagePackage(out: string): string {
	const dir = join(out, "package");
	mkdirSync(dir, { recursive: true });
	buildDist(join(dir, "dist"));
	cpSync(join(CORE, "src"), join(dir, "src"), { recursive: true, filter: shipped });
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
		// FLARE_TARBALL names a tarball already packed: the release checks the bytes it ships, not a fresh build.
		const tarball = process.env.FLARE_TARBALL ?? packTarball(stagePackage(join(stage, "build")), stage);
		const entries = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" }).split("\n").filter(Boolean);
		const root = installTarball(tarball, stage);
		const manifest: Manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
		return { stage, root, tarball, entries, manifest, close };
	} catch (error) {
		close();
		throw error;
	}
}

export type RunResult = { status: number; stdout: string };

// What the release touches, passed in so its rows run without git, npm, or a network.
export type ReleaseDeps = {
	run: (
		command: string,
		args: readonly string[],
		options?: { cwd?: string; env?: Record<string, string> },
	) => RunResult;
	pack: (out: string) => string;
	env: Record<string, string | undefined>;
	log: (line: string) => void;
};

type Flags = { publish: boolean; tarball: string | undefined; testCommand: string[] | undefined; out: string };

// The gates CI runs, the finished tree held complete, and the browser projects this OS owns.
const GATES: readonly string[][] = [
	["bun", "run", "fmt:check"],
	["bun", "run", "lint"],
	["bun", "run", "typecheck"],
	["bun", "run", "test"],
	["bun", "scripts/check-tree.ts", "--complete", "P14"],
	["bun", "run", "test:e2e"],
];

function parseFlags(argv: readonly string[]): Flags {
	const flags: Flags = {
		publish: false,
		tarball: undefined,
		testCommand: undefined,
		out: join(REPO, "node_modules/.flare-release"),
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const value = argv[index + 1];
		if (arg === "--publish") flags.publish = true;
		else if (value === undefined) throw new Error(`release: ${arg} is not a flag`);
		else if (arg === "--tarball") flags.tarball = value;
		else if (arg === "--out") flags.out = value;
		else if (arg === "--test-command") flags.testCommand = value.split(" ").filter(Boolean);
		else throw new Error(`release: ${arg} is not a flag`);
		if (arg !== "--publish") index += 1;
	}
	return flags;
}

function refuse(deps: ReleaseDeps, reason: string): number {
	deps.log(`release: ${reason}`);
	return 1;
}

function publish(deps: ReleaseDeps, tarball: string, extra: readonly string[]): number {
	const result = deps.run("npm", ["publish", tarball, "--access", "public", ...extra]);
	return result.status === 0 ? 0 : refuse(deps, `npm publish exited ${result.status}`);
}

// Locally and in the verify job: a clean tree whose tag, if HEAD has one, is the manifest's version, every gate green,
// then the packed tarball, the golden proof on those very bytes, and `npm publish --dry-run` of that tarball.
function dryRun(flags: Flags, version: string, deps: ReleaseDeps): number {
	if (deps.run("git", ["status", "--porcelain"]).stdout.trim() !== "") return refuse(deps, "the tree is dirty");
	const tag = deps.run("git", ["describe", "--tags", "--exact-match"]);
	const name = tag.stdout.trim();
	if (tag.status === 0 && name !== `v${version}`) return refuse(deps, `tag ${name} is not v${version}`);
	for (const [command = "", ...args] of flags.testCommand === undefined ? GATES : [flags.testCommand]) {
		if (deps.run(command, args).status !== 0) return refuse(deps, `${[command, ...args].join(" ")} failed`);
	}
	const tarball = deps.pack(flags.out);
	const golden = deps.run("bunx", ["vitest", "run", "tests/e2e/golden.test.ts"], {
		cwd: CORE,
		env: { FLARE_TARBALL: tarball },
	});
	if (golden.status !== 0) return refuse(deps, `the golden test failed on ${tarball}`);
	deps.log(`release: ${tarball} verified`);
	return publish(deps, tarball, ["--dry-run"]);
}

// Only a GitHub Actions run of the manifest version's tag publishes, and only the tarball the verify job checked.
function publishVerified(flags: Flags, version: string, deps: ReleaseDeps): number {
	const ref = `refs/tags/v${version}`;
	if (deps.env.GITHUB_ACTIONS !== "true" || deps.env.GITHUB_REF !== ref) {
		return refuse(deps, `--publish runs only in GitHub Actions on ${ref}`);
	}
	if (flags.tarball === undefined) return refuse(deps, "--publish needs --tarball, the tarball the verify job checked");
	const expected = `lovrozagar-flare-${version}.tgz`;
	if (basename(flags.tarball) !== expected) return refuse(deps, `${basename(flags.tarball)} is not ${expected}`);
	return publish(deps, flags.tarball, ["--provenance"]);
}

// `bun scripts/release.ts`: a dry run that ends at `npm publish --dry-run`. `--publish --tarball <tgz>` is the release
// workflow's publish step and refuses anywhere else (bits/14).
export function release(argv: readonly string[], deps: ReleaseDeps): number {
	let flags: Flags;
	try {
		flags = parseFlags(argv);
	} catch (error) {
		return refuse(deps, error instanceof Error ? error.message : String(error));
	}
	const manifest: Manifest = JSON.parse(readFileSync(join(CORE, "package.json"), "utf8"));
	const version = String(manifest.version);
	return flags.publish ? publishVerified(flags, version, deps) : dryRun(flags, version, deps);
}

function realDeps(): ReleaseDeps {
	return {
		run(command, args, options) {
			const result = spawnSync(command, args, {
				cwd: options?.cwd ?? REPO,
				env: { ...process.env, ...options?.env },
				encoding: "utf8",
				maxBuffer: 1 << 28,
				stdio: ["ignore", "pipe", "inherit"],
			});
			if (command !== "git") process.stdout.write(result.stdout ?? "");
			return { status: result.status ?? 1, stdout: result.stdout ?? "" };
		},
		pack(out) {
			mkdirSync(out, { recursive: true });
			return packTarball(stagePackage(join(out, "build")), out);
		},
		env: process.env,
		log: (line) => console.log(line),
	};
}

if (import.meta.main) process.exitCode = release(process.argv.slice(2), realDeps());
