import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, expect, it, vi } from "vitest";

// The bin runs `flare <command>` once when Node loads it, and reports through the exit code.
const app = mkdtempSync(join(tmpdir(), "flare-bin-"));

afterAll(() => rmSync(app, { recursive: true, force: true }));

afterEach(() => {
	process.exitCode = undefined;
	vi.restoreAllMocks();
	vi.resetModules();
});

async function run(argv: string[]): Promise<{ code: unknown; logged: string[]; errors: string[] }> {
	const logged: string[] = [];
	const errors: string[] = [];
	vi.spyOn(process, "argv", "get").mockReturnValue(["node", "flare", ...argv]);
	vi.spyOn(process, "cwd").mockReturnValue(app);
	vi.spyOn(console, "log").mockImplementation((line: string) => void logged.push(line));
	vi.spyOn(console, "error").mockImplementation((line: string) => void errors.push(line));
	await import("./flare.ts");
	return { code: process.exitCode, logged, errors };
}

it("codegen", async () => {
	const result = await run(["codegen"]);
	expect(result.code).toBe(0);
	expect(result.logged).toEqual(["flare codegen: wrote src/_gen/server-fns.gen.ts"]);
});

it("unknown command", async () => {
	const result = await run(["build"]);
	expect(result.code).toBe(1);
	expect(result.errors).toEqual(["flare: the one command is `flare codegen`. It does not watch: `vite dev` does"]);
});
