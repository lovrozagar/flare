import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// `bun run verify` (AGENTS.md, Every gate passes before moving on): every local gate in order, stopping at the first
// that fails with its exit code. On a clean tree where all pass, it stamps HEAD in `flare-verified/<sha>` of the
// repository's common git dir, which every worktree shares and nothing commits, so a commit verified in a fresh
// worktree outside the repo pushes from the main checkout. The pre-push hook (.githooks/pre-push) requires the stamp of
// every commit it pushes. A dirty tree is refused: the stamp would vouch for a commit the gates did not run on.

export const GATES: readonly { name: string; command: readonly string[] }[] = [
	{ name: "fmt:check", command: ["bun", "run", "fmt:check"] },
	{ name: "lint", command: ["bun", "run", "lint"] },
	{ name: "typecheck", command: ["bun", "run", "typecheck"] },
	{ name: "test", command: ["bun", "run", "test"] },
	{ name: "test:bun", command: ["bun", "run", "test:bun"] },
	{ name: "check-tree", command: ["bun", "scripts/check-tree.ts"] },
	{ name: "test:e2e", command: ["bun", "run", "test:e2e"] },
];

export type VerifyDeps = {
	// The command's exit code, its output going to the terminal.
	run: (command: readonly string[]) => number;
	git: (args: readonly string[]) => string;
	stamp: (path: string, body: string) => void;
	log: (line: string) => void;
	now: () => Date;
};

// The exit code: 0 when every gate passed and HEAD is stamped, else the failing gate's code, or 1 for a dirty tree.
export function verify(deps: VerifyDeps): number {
	if (deps.git(["status", "--porcelain"]).trim() !== "") {
		deps.log("verify: the tree has uncommitted changes; commit them first, so the stamp names what the gates ran on");
		return 1;
	}
	const sha = deps.git(["rev-parse", "HEAD"]).trim();
	for (const gate of GATES) {
		deps.log(`verify: ${gate.name}`);
		const code = deps.run(gate.command);
		if (code !== 0) {
			deps.log(`verify: ${gate.name} failed with exit code ${code}; no stamp for ${sha}`);
			return code;
		}
	}
	const common = resolve(deps.git(["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim());
	const path = join(common, "flare-verified", sha);
	deps.stamp(path, `${deps.now().toISOString()} ${GATES.map((gate) => gate.name).join(" ")}\n`);
	deps.log(`verify: every gate passed; stamped ${sha}`);
	return 0;
}

if (import.meta.main) {
	process.exitCode = verify({
		run: (command) => spawnSync(command[0] ?? "", command.slice(1), { stdio: "inherit" }).status ?? 1,
		git: (args) => spawnSync("git", args, { encoding: "utf8" }).stdout,
		stamp: (path, body) => {
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, body);
		},
		log: (line) => console.log(line),
		now: () => new Date(),
	});
}
