import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface ProjectInfo {
	hasFlare: boolean;
	hasFsCodegen: boolean;
	root: string;
	routesDir: string;
	srcDir: string;
}

const FS_ROUTE_SUFFIX_RE = /\.(page|layout|root-layout|path-segment)\.(tsx?|jsx?)$/;

function hasFsRouteSuffixes(routesDir: string): boolean {
	if (!existsSync(routesDir)) return false;
	let entries: string[];
	try {
		entries = readdirSync(routesDir, { recursive: true }) as string[];
	} catch {
		return false;
	}
	return entries.some((entry) => FS_ROUTE_SUFFIX_RE.test(String(entry).replace(/\\/g, "/")));
}

export function resolveProject(startDir?: string): ProjectInfo {
	const cwd = startDir ?? process.cwd();
	let dir = resolve(cwd);

	while (dir !== "/") {
		const pkgPath = join(dir, "package.json");
		if (existsSync(pkgPath)) {
			try {
				const raw: unknown = JSON.parse(readFileSync(pkgPath, "utf-8"));
				if (typeof raw === "object" && raw !== null) {
					const allDeps: Record<string, unknown> = {};
					if ("dependencies" in raw && typeof raw.dependencies === "object" && raw.dependencies !== null) {
						Object.assign(allDeps, raw.dependencies);
					}
					if ("devDependencies" in raw && typeof raw.devDependencies === "object" && raw.devDependencies !== null) {
						Object.assign(allDeps, raw.devDependencies);
					}
					if ("@lovrozagar/flare" in allDeps || "flare" in allDeps) {
						const srcDir = "src";
						const routesDir = join(dir, srcDir, "routes");
						return {
							hasFlare: true,
							hasFsCodegen: hasFsRouteSuffixes(routesDir),
							root: dir,
							routesDir,
							srcDir,
						};
					}
				}
			} catch {
				/* invalid JSON, skip */
			}
		}
		dir = resolve(dir, "..");
	}

	return {
		hasFlare: false,
		hasFsCodegen: false,
		root: cwd,
		routesDir: join(cwd, "src", "routes"),
		srcDir: "src",
	};
}

/**
 * Find root layout directory by scanning for root-layout files or createRootLayout calls.
 * Returns path relative to routesDir, e.g. "[[locale]]/_root_"
 */
export function findRootLayoutDir(routesDir: string): string | null {
	if (!existsSync(routesDir)) return null;

	let entries: string[];
	try {
		entries = readdirSync(routesDir, { recursive: true }) as string[];
	} catch {
		return null;
	}

	for (const entry of entries) {
		const normalized = (entry as string).replace(/\\/g, "/");
		const fileName = normalized.split("/").pop() ?? "";

		/* fs-codegen: *.root-layout.tsx or root-layout.tsx */
		if (
			fileName.endsWith(".root-layout.tsx") ||
			fileName.endsWith(".root-layout.ts") ||
			fileName === "root-layout.tsx" ||
			fileName === "root-layout.ts"
		) {
			return dirname(normalized);
		}

		/* string-codegen: file contains createRootLayout("...") */
		if (fileName.endsWith(".tsx") || fileName.endsWith(".ts")) {
			try {
				const content = readFileSync(join(routesDir, normalized), "utf-8");
				const match = /createRootLayout\s*(?:<[^>]*>)?\s*\(\s*["'`]([^"'`]+)["'`]/.exec(content);
				if (match) {
					const virtualPath = match[1] ?? "";
					return virtualPath;
				}
			} catch {
				/* skip unreadable files */
			}
		}
	}

	return null;
}
