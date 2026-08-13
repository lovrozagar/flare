import type { Command } from "commander"
import { addErrorBoundary, addToRoute } from "../add/index"
import { resolveRoute } from "../add/route-resolver"
import { resolveProject } from "../utils/project"

export function registerAdd(program: Command): void {
	const add = program.command("add").description("Add methods to existing route builder chains")

	add
		.command("auth <paths...>")
		.description("Add .authenticate() to routes")
		.action(async (paths: string[]) => {
			await runAdd(paths, "authenticate")
		})

	add
		.command("cache <paths...>")
		.description("Add .cache() to routes")
		.option("--isr <seconds>", "ISR revalidation interval")
		.option("--ssg", "Static site generation")
		.action(async (paths: string[], opts: { isr?: string; ssg?: boolean }) => {
			await runAdd(paths, "cache", {
				isr: opts.isr ? Number(opts.isr) : undefined,
				ssg: opts.ssg,
			})
		})

	add
		.command("loader <path>")
		.description("Add .loader() stub")
		.action(async (path: string) => {
			await runAdd([path], "loader")
		})

	add
		.command("head <path>")
		.description("Add .head() with title placeholder")
		.action(async (path: string) => {
			await runAdd([path], "head")
		})

	add
		.command("input <path>")
		.description("Add .input() schema stub")
		.action(async (path: string) => {
			await runAdd([path], "input")
		})

	add
		.command("error-boundary <path>")
		.description("Add .errorRender() + .notFoundRender()")
		.action(async (path: string) => {
			const project = resolveProject()
			if (!project.hasFlare) {
				process.stderr.write("error: flare not found in dependencies\n")
				process.exit(1)
			}

			const { scanSourceFiles } = await import("flare/generators")
			const defs = scanSourceFiles({ rootDir: project.root, srcDir: project.srcDir })
			const def = resolveRoute(path, defs)

			if (!def) {
				process.stderr.write(`error: route not found: ${path}\n`)
				process.exit(1)
			}

			const results = addErrorBoundary(project.root, def)
			for (const r of results) {
				if (r.success) {
					process.stdout.write(`added .${r.method}() to ${r.filePath}\n`)
				} else {
					process.stderr.write(`skip: .${r.method}() already exists or chain not found\n`)
				}
			}
		})
}

async function runAdd(
	paths: string[],
	method: string,
	opts?: { isr?: number; ssg?: boolean },
): Promise<void> {
	const project = resolveProject()
	if (!project.hasFlare) {
		process.stderr.write("error: flare not found in dependencies\n")
		process.exit(1)
	}

	const { scanSourceFiles } = await import("flare/generators")
	const defs = scanSourceFiles({ rootDir: project.root, srcDir: project.srcDir })

	for (const path of paths) {
		const result = addToRoute(project.root, defs, path, method, opts)
		if (!result) {
			process.stderr.write(`error: route not found: ${path}\n`)
			continue
		}
		if (result.success) {
			process.stdout.write(`added .${result.method}() to ${result.filePath}\n`)
		} else {
			process.stderr.write(
				`skip: .${result.method}() already exists or chain not found in ${result.filePath}\n`,
			)
		}
	}
}
