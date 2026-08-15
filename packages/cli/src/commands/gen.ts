import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { Command } from "commander";
import { layoutTemplate, pageTemplate, resourceTemplates, serverFnTemplate } from "../templates";
import { findRootLayoutDir, resolveProject } from "../utils/project";

function writeGenFile(filePath: string, content: string): void {
	if (existsSync(filePath)) {
		process.stderr.write(`error: ${filePath} already exists\n`);
		process.exit(1);
	}
	mkdirSync(dirname(filePath), { recursive: true });
	writeFileSync(filePath, content, "utf-8");
}

async function autoCodegen(project: { hasFsCodegen: boolean; root: string }): Promise<void> {
	try {
		const { runGenerate } = await import("@lovrozagar/flare/generators");
		runGenerate({
			fsCodegen: project.hasFsCodegen,
			rootDir: project.root,
		});
	} catch {
		/* codegen not available — user runs manually */
	}
}

export function registerGen(program: Command): void {
	const gen = program.command("gen").description("Scaffold routes, layouts, server functions");

	gen
		.command("page <path>")
		.description("Generate a page route")
		.option("--json", "Output structured result")
		.action(async (routePath: string, opts: { json?: boolean }) => {
			const project = resolveProject();
			const rootDir = findRootLayoutDir(project.routesDir);
			const name = routePath.split("/").filter(Boolean).pop() ?? "page";

			const base = rootDir
				? join(project.routesDir, rootDir, routePath.replace(/^\//, ""))
				: join(project.routesDir, routePath.replace(/^\//, ""));

			const filePath = join(base, `${name}.page.tsx`);
			writeGenFile(filePath, pageTemplate(name));
			await autoCodegen(project);

			const rel = relative(project.root, filePath);
			if (opts.json) {
				process.stdout.write(
					`${JSON.stringify({ customize: [{ file: rel, hint: "add render content", method: "render" }], generated: [rel] }, null, 2)}\n`,
				);
			} else {
				process.stdout.write(`created ${rel}\n`);
			}
		});

	gen
		.command("layout <path>")
		.description("Generate a layout")
		.option("--json", "Output structured result")
		.action(async (routePath: string, opts: { json?: boolean }) => {
			const project = resolveProject();
			const rootDir = findRootLayoutDir(project.routesDir);
			const name = routePath.split("/").filter(Boolean).pop() ?? "layout";

			const base = rootDir
				? join(project.routesDir, rootDir, routePath.replace(/^\//, ""))
				: join(project.routesDir, routePath.replace(/^\//, ""));

			const filePath = join(base, `${name}.layout.tsx`);
			writeGenFile(filePath, layoutTemplate(name));
			await autoCodegen(project);

			const rel = relative(project.root, filePath);
			if (opts.json) {
				process.stdout.write(`${JSON.stringify({ generated: [rel] }, null, 2)}\n`);
			} else {
				process.stdout.write(`created ${rel}\n`);
			}
		});

	gen
		.command("resource <names...>")
		.description("Generate resource routes (list + detail, optionally CRUD)")
		.option("--crud", "Include CRUD server functions")
		.option("--json", "Output structured result")
		.action(async (names: string[], opts: { crud?: boolean; json?: boolean }) => {
			const project = resolveProject();
			const rootDir = findRootLayoutDir(project.routesDir);
			const allGenerated: string[] = [];
			const allCustomize: Array<{ file: string; hint: string; method: string }> = [];

			for (const name of names) {
				const result = resourceTemplates(name, opts.crud);
				const baseDir = rootDir ? join(project.routesDir, rootDir, name) : join(project.routesDir, name);

				for (const route of result.routes) {
					const filePath = join(baseDir, route.path);
					writeGenFile(filePath, route.content);
					const rel = relative(project.root, filePath);
					allGenerated.push(rel);
					for (const c of route.customize) {
						allCustomize.push({ file: rel, ...c });
					}
				}

				if (opts.crud && result.serverFn) {
					const fnPath = join(project.root, "src", "server-fns", `${name}.ts`);
					writeGenFile(fnPath, result.serverFn.content);
					allGenerated.push(relative(project.root, fnPath));
					for (const c of result.serverFn.customize) {
						allCustomize.push({ file: relative(project.root, fnPath), ...c });
					}
				}
			}

			await autoCodegen(project);

			if (opts.json) {
				process.stdout.write(
					`${JSON.stringify({ customize: allCustomize, generated: allGenerated, next: "flare codegen" }, null, 2)}\n`,
				);
			} else {
				for (const f of allGenerated) {
					process.stdout.write(`created ${f}\n`);
				}
			}
		});

	gen
		.command("server-fn <name>")
		.description("Generate a server function")
		.option("--json", "Output structured result")
		.action((name: string, opts: { json?: boolean }) => {
			const project = resolveProject();
			const filePath = join(project.root, "src", "server-fns", `${name}.ts`);
			writeGenFile(filePath, serverFnTemplate(name));

			const rel = relative(project.root, filePath);
			if (opts.json) {
				process.stdout.write(`${JSON.stringify({ generated: [rel] }, null, 2)}\n`);
			} else {
				process.stdout.write(`created ${rel}\n`);
			}
		});
}
