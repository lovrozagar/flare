import type { Command } from "commander";
import { resolveProject } from "../utils/project";

export function registerRoutes(program: Command): void {
	program
		.command("routes")
		.description("List all routes")
		.option("--json", "Output as JSON")
		.action(async (opts: { json?: boolean }) => {
			const project = resolveProject();

			if (!project.hasFlare) {
				process.stderr.write("error: flare not found in dependencies\n");
				process.exit(1);
			}

			const { scanSourceFiles } = await import("@lovrozagar/flare/generators");
			const defs = scanSourceFiles({ rootDir: project.root, srcDir: project.srcDir });

			if (opts.json) {
				process.stdout.write(`${JSON.stringify(defs, null, 2)}\n`);
				return;
			}

			const pages = defs.filter((d) => d.type === "page");
			const layouts = defs.filter((d) => d.type !== "page");

			if (pages.length === 0 && layouts.length === 0) {
				process.stdout.write("No routes found.\n");
				return;
			}

			if (pages.length > 0) {
				process.stdout.write("\nRoutes:\n");
				for (const def of pages) {
					let auth = "";
					if (def.authenticateMode === true) auth = "[auth]";
					else if (def.authenticateMode === "optional") auth = "[auth?]";
					let cache = "";
					if (def.cache.isr) cache = "[ISR]";
					else if (def.cache.ssg) cache = "[SSG]";
					process.stdout.write(`  ${def.virtualPath.padEnd(45)} ${auth.padEnd(8)} ${cache}\n`);
				}
			}

			if (layouts.length > 0) {
				process.stdout.write("\nLayouts:\n");
				for (const def of layouts) {
					let typeLabel = "";
					if (def.type === "root-layout") typeLabel = "(root)";
					else if (def.type === "path-segment") typeLabel = "(segment)";
					process.stdout.write(`  ${def.virtualPath.padEnd(45)} ${typeLabel}\n`);
				}
			}

			process.stdout.write(`\n${pages.length} routes, ${layouts.length} layouts\n`);
		});
}
