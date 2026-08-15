import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

export interface TailwindCompiler {
	build: (classes: string[]) => string;
	themeVars: Map<string, string>;
}

/**
 * Tokens Tailwind expresses as literal class selectors for descendants to target.
 * Must land on the DOM as a real `class=` attribute.
 */
const MARKER_TOKEN_RE = /^(?:group|peer)(?:\/[\w-]+)?$/;

export function splitTokens(classes: string): { markers: string[]; utilities: string } {
	const markers: string[] = [];
	const utilities: string[] = [];
	for (const tok of classes.split(/\s+/).filter(Boolean)) {
		if (MARKER_TOKEN_RE.test(tok)) markers.push(tok);
		else utilities.push(tok);
	}
	return { markers, utilities: utilities.join(" ") };
}

function extractPseudo(selector: string): string | null {
	for (let i = selector.length - 1; i >= 0; i--) {
		if (selector[i] === ":" && (i === 0 || selector[i - 1] !== "\\")) {
			return selector.slice(i);
		}
	}
	return null;
}

function cssEscapeClass(cls: string): string {
	return cls.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}

function selectorMatchesAny(selector: string, prefixes: Set<string>): boolean {
	for (const prefix of prefixes) {
		if (
			selector === prefix ||
			selector.startsWith(`${prefix}:`) ||
			selector.startsWith(`${prefix} `) ||
			selector.startsWith(`${prefix},`)
		) {
			return true;
		}
	}
	return false;
}

function extractLayerContent(css: string, atStart: number): string {
	const braceStart = css.indexOf("{", atStart);
	if (braceStart === -1) return "";
	let depth = 1;
	let i = braceStart + 1;
	for (; i < css.length; i++) {
		if (css[i] === "{") depth++;
		else if (css[i] === "}") {
			depth--;
			if (depth === 0) break;
		}
	}
	return css.slice(braceStart + 1, i).trim();
}

function extractDeclsInner(css: string, selectorSet?: Set<string>): string {
	const result: string[] = [];
	let remaining = css.trim();
	while (remaining.length > 0) {
		remaining = remaining.trim();
		if (remaining.length === 0) break;

		if (remaining.startsWith("@")) {
			const braceStart = remaining.indexOf("{");
			if (braceStart === -1) break;
			const atRule = remaining.slice(0, braceStart).trim();
			let depth = 1;
			let i = braceStart + 1;
			for (; i < remaining.length; i++) {
				if (remaining[i] === "{") depth++;
				else if (remaining[i] === "}") {
					depth--;
					if (depth === 0) break;
				}
			}
			const inner = remaining.slice(braceStart + 1, i).trim();
			const innerDecls = extractDeclsInner(inner, selectorSet);
			if (innerDecls.length > 0) {
				result.push(`${atRule} { ${innerDecls} }`);
			}
			remaining = remaining.slice(i + 1).trim();
			continue;
		}

		const braceStart = remaining.indexOf("{");
		if (braceStart === -1) break;
		const selector = remaining.slice(0, braceStart).trim();
		let depth = 1;
		let i = braceStart + 1;
		for (; i < remaining.length; i++) {
			if (remaining[i] === "{") depth++;
			else if (remaining[i] === "}") {
				depth--;
				if (depth === 0) break;
			}
		}
		const body = remaining.slice(braceStart + 1, i).trim();
		const matchesFilter = !selectorSet || selectorMatchesAny(selector, selectorSet);
		if (matchesFilter && body.length > 0) {
			const pseudo = extractPseudo(selector);
			if (pseudo) {
				result.push(`&${pseudo} { ${body} }`);
			} else {
				result.push(body);
			}
		}
		remaining = remaining.slice(i + 1).trim();
	}
	return result.join(";");
}

function resolveThemeVars(css: string, themeVars: Map<string, string>): string {
	let result = css;
	for (let i = 0; i < 5; i++) {
		const next = result.replace(/var\((--[\w-]+)\)/g, (full, name: string) => {
			return themeVars.get(name) ?? full;
		});
		if (next === result) break;
		result = next;
	}
	return result;
}

/**
 * Returns the full Tailwind preamble from a zero-class build output — everything
 * except the `@layer utilities` block. Captures theme vars and preflight so
 * browser defaults are normalized even when no utility classes are present.
 */
export function extractPrefaceCss(cssOutput: string): string {
	const stripped = cssOutput.replace(/\/\*[\s\S]*?\*\//g, "").trim();
	/* Strip the utilities layer entirely; keep theme + base + components. */
	const utilMatch = stripped.match(/@layer\s+utilities\s*\{/);
	if (!utilMatch || utilMatch.index === undefined) return stripped;
	const beforeUtil = stripped.slice(0, utilMatch.index).trim();
	const afterUtil = (() => {
		const braceStart = stripped.indexOf("{", utilMatch.index);
		if (braceStart === -1) return "";
		let depth = 1;
		let i = braceStart + 1;
		for (; i < stripped.length; i++) {
			if (stripped[i] === "{") depth++;
			else if (stripped[i] === "}") {
				depth--;
				if (depth === 0) break;
			}
		}
		return stripped.slice(i + 1).trim();
	})();
	return [beforeUtil, afterUtil].filter(Boolean).join("\n").trim();
}

export function extractDeclarations(
	cssOutput: string,
	requestedClasses: string[],
	themeVars?: Map<string, string>,
): string {
	const stripped = cssOutput.replace(/\/\*[\s\S]*?\*\//g, "").trim();
	const utilMatch = stripped.match(/@layer\s+utilities\s*\{/);
	const toParse = utilMatch ? extractLayerContent(stripped, utilMatch.index ?? 0) : stripped;
	const selectorSet = new Set(requestedClasses.map((c) => `.${cssEscapeClass(c)}`));
	let raw = extractDeclsInner(toParse, selectorSet);
	if (themeVars) {
		raw = resolveThemeVars(raw, themeVars);
	}
	return raw.replace(/\s+/g, " ").trim();
}

/** Initialize a Tailwind v4 compiler from an optional CSS entry file. */
export async function initTailwindCompiler(cssPath?: string): Promise<TailwindCompiler> {
	try {
		const tw = await import("tailwindcss");
		const compileFn = tw.compile ?? (tw.default as { compile?: unknown })?.compile;
		if (typeof compileFn !== "function") {
			throw new Error(
				"tailwindcss compile function not found. Ensure tailwindcss ^4.0 is installed: bun add tailwindcss@latest",
			);
		}

		let cssContent: string;
		if (cssPath) {
			cssContent = readFileSync(resolve(cssPath), "utf-8");
		} else {
			cssContent = '@import "tailwindcss";';
		}

		const compiler = await (
			compileFn as (
				css: string,
				opts?: unknown,
			) => Promise<{
				build: (classes: string[]) => string;
			}>
		)(cssContent, {
			loadStylesheet: (id: string, base: string) => {
				if (id === "tailwindcss") {
					const esmRequire = createRequire(import.meta.url);
					const pkgPath = esmRequire.resolve("tailwindcss/package.json");
					const pkgDir = dirname(pkgPath);
					const cssPath2 = join(pkgDir, "index.css");
					const content = readFileSync(cssPath2, "utf-8");
					return { base: pkgDir, content, path: cssPath2 };
				}
				const resolved = resolve(base, id);
				const content = readFileSync(resolved, "utf-8");
				return { base: dirname(resolved), content, path: resolved };
			},
		});

		const themeVars = new Map<string, string>();
		const originalBuild = compiler.build.bind(compiler);
		const trackingBuild = (classes: string[]): string => {
			const output = originalBuild(classes);
			for (const m of output.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) {
				if (!themeVars.has(m[1])) {
					themeVars.set(m[1], m[2].trim());
				}
			}
			return output;
		};

		return { build: trackingBuild, themeVars };
	} catch (e: unknown) {
		throw new Error(
			`tailwindcss init failed: ${e instanceof Error ? e.message : String(e)}. Check tailwind.config.ts for syntax errors.`,
			{ cause: e },
		);
	}
}
