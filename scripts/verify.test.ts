import { expect, it } from "vitest";
import { GATES, verify, type VerifyDeps } from "./verify.ts";

// A fake repo: gates answer from `codes` by name, git from `porcelain`, and every call is recorded.
function fake(codes: Record<string, number> = {}, porcelain = "") {
	const ran: string[] = [];
	const stamps: { path: string; body: string }[] = [];
	const deps: VerifyDeps = {
		run: (command) => {
			const gate = GATES.find((entry) => entry.command === command);
			ran.push(gate?.name ?? command.join(" "));
			return codes[gate?.name ?? ""] ?? 0;
		},
		git: (args) => {
			if (args[0] === "status") return porcelain;
			if (args[1] === "HEAD") return "abc123\n";
			return "/repo/.git\n";
		},
		stamp: (path, body) => void stamps.push({ path, body }),
		log: () => undefined,
		now: () => new Date("2026-10-15T09:00:00.000Z"),
	};
	return { deps, ran, stamps };
}

// The seven gates of AGENTS.md, in its order.
it("gate order", () => {
	expect(GATES.map((gate) => gate.name)).toEqual([
		"fmt:check",
		"lint",
		"typecheck",
		"test",
		"test:bun",
		"check-tree",
		"test:e2e",
	]);
});

// Every gate passes: HEAD is stamped in the common git dir's `flare-verified`.
it("all pass", () => {
	const repo = fake();
	expect(verify(repo.deps)).toBe(0);
	expect(repo.ran).toEqual(GATES.map((gate) => gate.name));
	expect(repo.stamps).toEqual([
		{
			path: "/repo/.git/flare-verified/abc123",
			body: "2026-10-15T09:00:00.000Z fmt:check lint typecheck test test:bun check-tree test:e2e\n",
		},
	]);
});

// A planted failing gate stops the run with that gate's own exit code, runs nothing after it, and stamps nothing.
it("failing gate", () => {
	const repo = fake({ typecheck: 2 });
	expect(verify(repo.deps)).toBe(2);
	expect(repo.ran).toEqual(["fmt:check", "lint", "typecheck"]);
	expect(repo.stamps).toEqual([]);
});

// A dirty tree runs no gate and stamps nothing.
it("dirty tree", () => {
	const repo = fake({}, " M README.md\n");
	expect(verify(repo.deps)).toBe(1);
	expect(repo.ran).toEqual([]);
	expect(repo.stamps).toEqual([]);
});
