import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "commander";
import { addErrorBoundary, addToRoute, addUnauthenticatedBoundary } from "../add/index";
import { resolveRoute } from "../add/route-resolver";
import { resolveProject } from "../utils/project";
import { detectAllChains } from "../validate/chain-detect";
import type { Diagnostic, EnrichedDefinition } from "../validate/rules";
import { runRules } from "../validate/rules";

export function registerValidate(program: Command): void {
	program
		.command("validate")
		.description("Validate routes and detect missing best practices")
		.option("--json", "Output as JSON")
		.option("--fix", "Auto-fix warnings where possible")
		.action(async (opts: { fix?: boolean; json?: boolean }) => {
			const project = resolveProject();

			if (!project.hasFlare) {
				process.stderr.write("error: flare not found in dependencies\n");
				process.exit(1);
			}

			const { scanSourceFiles, validateRouteDefinitions } = await import("@lovrozagar/flare/generators");
			const defs = scanSourceFiles({ rootDir: project.root, srcDir: project.srcDir });
			const validationErrors = validateRouteDefinitions(defs);

			/* Enrich with chain method detection */
			const enriched: EnrichedDefinition[] = defs.map((def) => {
				const fullPath = join(project.root, def.filePath);
				let source = "";
				try {
					source = readFileSync(fullPath, "utf-8");
				} catch {
					/* skip unreadable */
				}
				const chains = detectAllChains(source);
				const chain = chains.find((c) => c.virtualPath === def.virtualPath);
				return {
					...def,
					chainMethods: chain?.chainMethods ?? {
						hasAuthorize: false,
						hasEffects: false,
						hasErrorRender: false,
						hasHead: false,
						hasHeaders: false,
						hasLoader: false,
						hasNotFoundRender: false,
						hasPreloader: false,
						hasRender: false,
						hasResponse: false,
						hasUnauthenticatedRender: false,
						hasUnauthorizedRender: false,
					},
				};
			});

			const diagnostics = runRules(enriched, validationErrors);

			if (opts.fix) {
				const fixable = diagnostics.filter((d) => d.fix && d.level === "warning");
				for (const diag of fixable) {
					applyFix(project.root, defs, diag);
				}
				if (fixable.length > 0) {
					process.stdout.write(`fixed ${fixable.length} issue(s)\n`);
				}
			}

			if (opts.json) {
				process.stdout.write(`${JSON.stringify(diagnostics, null, 2)}\n`);
				return;
			}

			if (diagnostics.length === 0) {
				process.stdout.write("No issues found.\n");
				return;
			}

			const errors = diagnostics.filter((d) => d.level === "error");
			const warnings = diagnostics.filter((d) => d.level === "warning");
			const infos = diagnostics.filter((d) => d.level === "info");

			for (const d of [...errors, ...warnings, ...infos]) {
				let prefix = "INFO ";
				if (d.level === "error") prefix = "ERROR";
				else if (d.level === "warning") prefix = "WARN ";
				process.stdout.write(`${prefix} ${d.rule}\n`);
				if (d.filePath) {
					process.stdout.write(`  ${d.filePath}\n`);
				}
				process.stdout.write(`  ${d.message}\n`);
				if (d.fix) {
					process.stdout.write(`  fix: ${d.fix.command}\n`);
				}
				process.stdout.write("\n");
			}

			const counts: string[] = [];
			if (errors.length > 0) counts.push(`${errors.length} error(s)`);
			if (warnings.length > 0) counts.push(`${warnings.length} warning(s)`);
			if (infos.length > 0) counts.push(`${infos.length} info`);
			process.stdout.write(`${counts.join(", ")}\n`);

			if (errors.length > 0) process.exit(1);
		});
}

function applyFix(
	rootDir: string,
	defs: import("@lovrozagar/flare/generators").RouteDefinition[],
	diag: Diagnostic,
): void {
	if (!diag.fix) return;

	switch (diag.rule) {
		case "loader-no-error-boundary": {
			const def = resolveRoute(extractPathFromCommand(diag.fix.command), defs);
			if (def) addErrorBoundary(rootDir, def);
			break;
		}
		case "auth-no-boundary": {
			const def = resolveRoute(extractPathFromCommand(diag.fix.command), defs);
			if (def) addUnauthenticatedBoundary(rootDir, def);
			break;
		}
		case "public-no-head": {
			addToRoute(rootDir, defs, extractPathFromCommand(diag.fix.command), "head");
			break;
		}
		case "public-no-cache": {
			addToRoute(rootDir, defs, extractPathFromCommand(diag.fix.command), "cache", { ssg: true });
			break;
		}
	}
}

function extractPathFromCommand(command: string): string {
	const parts = command.split(" ");
	return parts[3] ?? "";
}
