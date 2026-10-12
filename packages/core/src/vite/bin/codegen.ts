import { writeGenerated } from "../codegen/write.ts";

// The bin's commands. `flare codegen` writes the generated files once and does not watch: `vite dev` is the watch
// (dx/plugin.md).
export const COMMANDS = ["codegen"] as const;

export type BinOutput = { log(line: string): void; error(line: string): void };

// `flare codegen` in `cwd`: the files the plugin writes when a build or `vite dev` starts. The exit code is 0 when they
// are written or already current, and 1 for another command or a codegen failure.
export function runBin(argv: readonly string[], cwd: string, out: BinOutput): number {
	if (argv.length !== 1 || argv[0] !== "codegen") {
		out.error("flare: the one command is `flare codegen`. It does not watch: `vite dev` does");
		return 1;
	}
	try {
		const changed = writeGenerated(cwd);
		out.log(changed.length === 0 ? "flare codegen: up to date" : `flare codegen: wrote ${changed.join(", ")}`);
		return 0;
	} catch (error) {
		out.error(String(error));
		return 1;
	}
}
