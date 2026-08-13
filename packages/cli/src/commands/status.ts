import type { Command } from "commander"
import { resolveProject } from "../utils/project"

export function registerStatus(program: Command): void {
	program
		.command("status")
		.description("Project health overview")
		.option("--json", "Output as JSON")
		.action(async (opts: { json?: boolean }) => {
			const project = resolveProject()

			if (!project.hasFlare) {
				process.stderr.write("error: flare not found in dependencies\n")
				process.exit(1)
			}

			const { scanSourceFiles } = await import("flare/generators")
			const defs = scanSourceFiles({ rootDir: project.root, srcDir: project.srcDir })

			const pages = defs.filter((d) => d.type === "page")
			const layouts = defs.filter(
				(d) => d.type === "layout" || d.type === "root-layout" || d.type === "path-segment",
			)
			const authed = pages.filter((d) => d.authenticateMode !== false)
			const publicPages = pages.filter((d) => d.authenticateMode === false)
			const isr = pages.filter((d) => d.cache.isr)
			const ssg = pages.filter((d) => d.cache.ssg)
			const ssr = pages.filter((d) => !d.cache.isr && !d.cache.ssg)

			if (opts.json) {
				process.stdout.write(
					`${JSON.stringify(
						{
							authenticated: authed.length,
							codegen: project.hasFsCodegen ? "filesystem" : "string",
							isr: isr.length,
							layouts: layouts.length,
							public: publicPages.length,
							routes: pages.length,
							ssg: ssg.length,
							ssr: ssr.length,
						},
						null,
						2,
					)}\n`,
				)
				return
			}

			process.stdout.write(`\nFlare | ${pages.length} routes | ${layouts.length} layouts\n\n`)
			process.stdout.write(
				`Routes:     ${authed.length} authenticated, ${publicPages.length} public\n`,
			)
			process.stdout.write(`Cache:      ${isr.length} ISR, ${ssg.length} SSG, ${ssr.length} SSR\n`)
			process.stdout.write(`Codegen:    ${project.hasFsCodegen ? "filesystem" : "string"}\n\n`)
		})
}
