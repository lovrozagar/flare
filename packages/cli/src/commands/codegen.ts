import type { Command } from "commander"
import { resolveProject } from "../utils/project"

export function registerCodegen(program: Command): void {
	program
		.command("codegen")
		.description("Generate routes.gen.ts and type declarations")
		.option("--fs", "Filesystem-based codegen (derive paths from file positions)")
		.option("--src <dir>", "Source directory", "src")
		.option("--output <path>", "Output path for routes.gen.ts")
		.action(async (opts: { fs?: boolean; output?: string; src: string }) => {
			const project = resolveProject()

			if (!project.hasFlare) {
				process.stderr.write("error: flare not found in dependencies\n")
				process.exit(1)
			}

			const { runGenerate } = await import("flare/generators")

			const result = runGenerate({
				fsCodegen: opts.fs ?? project.hasFsCodegen,
				outputPath: opts.output,
				rootDir: project.root,
				srcDir: opts.src,
			})

			process.stdout.write(`codegen: ${result.routes} routes, ${result.layouts} layouts\n`)
		})
}
