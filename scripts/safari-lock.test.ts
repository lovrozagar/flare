import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { acquire, quote, release, type Lock, type Remote } from "./safari-lock.ts";

// The lock's own shell scripts, run by a local `sh` as the Mac's would run them over ssh.
const local: Remote = (script, args) => {
	const run = spawnSync("sh", ["-c", script, "sh", ...args], { encoding: "utf8" });
	return { status: run.status, stdout: run.stdout };
};

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function lockAt(owner: string): Lock {
	const dir = mkdtempSync(join(tmpdir(), "flare-safari-lock-"));
	dirs.push(dir);
	return { path: join(dir, "safari.lock"), owner, staleMs: 60_000 };
}

// A second run while one holds the lock fails at once, naming the holder and when it started; the first run's lock is
// left alone.
it("held lock fails", () => {
	const first = lockAt("pc:100");
	const second = { ...first, owner: "pc:200" };
	acquire(local, first, 1_760_000_000_000);
	expect(() => acquire(local, second, 1_760_000_030_000)).toThrow(
		"Safari is in use by pc:100, since 2025-10-09T08:53:20.000Z",
	);
	expect(readFileSync(join(first.path, "owner"), "utf8")).toBe("pc:100 1760000000000\n");
});

// Released, the lock is free for the next run. A run that does not own it cannot release it.
it("release frees", () => {
	const first = lockAt("pc:100");
	acquire(local, first, 1000);
	release(local, { ...first, owner: "pc:999" });
	expect(existsSync(first.path)).toBe(true);
	release(local, first);
	expect(existsSync(first.path)).toBe(false);
	acquire(local, { ...first, owner: "pc:200" }, 2000);
	expect(readFileSync(join(first.path, "owner"), "utf8")).toBe("pc:200 2000\n");
});

// A lock older than a run's limit is a run that died before its release: the next run takes it over.
it("stale taken", () => {
	const first = lockAt("pc:100");
	acquire(local, first, 1000);
	acquire(local, { ...first, owner: "pc:200" }, 1000 + 60_001);
	expect(readFileSync(join(first.path, "owner"), "utf8")).toBe("pc:200 61001\n");
});

// A lock command that cannot run, as when ssh fails, fails the run rather than skipping the lock.
it("no answer fails", () => {
	expect(() => acquire(() => ({ status: 255, stdout: "" }), lockAt("pc:1"), 0)).toThrow(
		"The Safari lock on the Mac did not answer (exit 255)",
	);
});

// An argument reaches the remote shell as one word, quotes included.
it("quote", () => {
	expect(spawnSync("sh", ["-c", `printf %s ${quote("a b'c")}`], { encoding: "utf8" }).stdout).toBe("a b'c");
});
