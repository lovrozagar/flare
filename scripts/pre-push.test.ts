import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { verify } from "./verify.ts";

// The pre-push hook (.githooks/pre-push) against a throwaway clone and bare remote: a push is refused while any
// commit it sends has no `bun run verify` stamp, and goes through once each has one. Each repo runs its own executable
// copy of the hook, so the test does not depend on the file's mode in this checkout.
const HOOK = join(import.meta.dirname, "../.githooks/pre-push");
const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function repo() {
	const root = mkdtempSync(join(tmpdir(), "flare-pre-push-"));
	roots.push(root);
	const work = join(root, "work");
	const git = (...args: string[]): string => execFileSync("git", args, { cwd: work, encoding: "utf8" }).trim();
	execFileSync("git", ["init", "-q", "--bare", "-b", "main", join(root, "remote.git")]);
	execFileSync("git", ["init", "-q", "-b", "main", work]);
	git("config", "user.name", "Flare Test");
	git("config", "user.email", "test@example.com");
	const hooks = join(root, "hooks");
	mkdirSync(hooks);
	copyFileSync(HOOK, join(hooks, "pre-push"));
	chmodSync(join(hooks, "pre-push"), 0o755);
	git("config", "core.hooksPath", hooks);
	git("remote", "add", "origin", join(root, "remote.git"));
	const commit = (name: string): string => {
		writeFileSync(join(work, name), name);
		git("add", name);
		git("commit", "-q", "-m", `chore: add ${name}`);
		return git("rev-parse", "HEAD");
	};
	const push = () => spawnSync("git", ["push", "-q", "origin", "main"], { cwd: work, encoding: "utf8" });
	const stamp = (sha: string): void => {
		mkdirSync(join(work, ".git/flare-verified"), { recursive: true });
		writeFileSync(join(work, ".git/flare-verified", sha), "stamped\n");
	};
	return { root, git, commit, push, stamp };
}

// An unstamped commit is refused and named; stamped, it pushes.
it("unstamped refused", () => {
	const local = repo();
	const first = local.commit("a.txt");
	const refused = local.push();
	expect(refused.status).not.toBe(0);
	expect(refused.stderr).toContain("push refused");
	expect(refused.stderr).toContain(first.slice(0, 7));
	local.stamp(first);
	expect(local.push().status).toBe(0);
});

// Every commit the push sends needs its own stamp, not only the tip, and commits the remote has need none.
it("each commit", () => {
	const local = repo();
	local.stamp(local.commit("a.txt"));
	expect(local.push().status).toBe(0);
	const second = local.commit("b.txt");
	const third = local.commit("c.txt");
	local.stamp(third);
	const refused = local.push();
	expect(refused.status).not.toBe(0);
	expect(refused.stderr).toContain(second.slice(0, 7));
	expect(refused.stderr).not.toContain(third.slice(0, 7));
	local.stamp(second);
	expect(local.push().status).toBe(0);
});

// A commit `bun run verify` passed in a linked worktree outside the checkout pushes from the main checkout, since both
// share the common git dir; a commit verify never passed is still refused.
it("verified in a worktree", () => {
	const local = repo();
	const first = local.commit("a.txt");
	const outside = join(local.root, "outside");
	local.git("worktree", "add", "-q", "--detach", outside, first);
	const passed = verify({
		run: () => 0,
		git: (args) => execFileSync("git", args, { cwd: outside, encoding: "utf8" }),
		stamp: (path, body) => {
			mkdirSync(join(path, ".."), { recursive: true });
			writeFileSync(path, body);
		},
		log: () => undefined,
		now: () => new Date(0),
	});
	expect(passed).toBe(0);
	expect(local.push().status).toBe(0);
	const unverified = local.commit("b.txt");
	const refused = local.push();
	expect(refused.status).not.toBe(0);
	expect(refused.stderr).toContain(unverified.slice(0, 7));
});

// The hook is tracked executable, as git runs only an executable hook: at mode 644 it is skipped and every push goes
// through unchecked.
it("hook executable", () => {
	const tracked = execFileSync("git", ["ls-files", "--stage", ".githooks/pre-push", ".githooks/commit-msg"], {
		cwd: join(import.meta.dirname, ".."),
		encoding: "utf8",
	});
	expect(
		tracked
			.trim()
			.split("\n")
			.map((line) => `${line.split("\t")[1]} ${line.split(" ")[0]}`),
	).toEqual([".githooks/commit-msg 100755", ".githooks/pre-push 100755"]);
});
