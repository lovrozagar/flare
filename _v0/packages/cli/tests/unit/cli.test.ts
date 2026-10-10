/** @vitest-environment node */
/* Every command module is reachable from the binary; README documents each of them. */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CLI = fileURLToPath(new URL("../../src/cli.ts", import.meta.url));
const COMMANDS = fileURLToPath(new URL("../../src/commands/", import.meta.url));

function flare(...args: string[]): string {
	return execFileSync("bun", [CLI, ...args], { encoding: "utf8", stdio: "pipe" });
}

const modules = readdirSync(COMMANDS)
	.filter((file) => file.endsWith(".ts"))
	.map((file) => file.slice(0, -".ts".length));

describe("flare binary", () => {
	it("registers a command for every module in src/commands", () => {
		const help = flare("--help");
		const listed = [...help.matchAll(/^\s{2}(\w[\w-]*)/gm)].map((m) => m[1]);
		expect(modules.filter((name) => !listed.includes(name))).toEqual([]);
	});

	it.each(modules)("`flare %s --help` runs", (name) => {
		expect(flare(name, "--help")).toContain(`flare ${name}`);
	});
});
