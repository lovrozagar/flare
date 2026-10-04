import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isLocalVar } from "./sx-ast/compose-css.ts";

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

/**
 * What follows a requested utility's own class in `selector`: "" for the bare class, the variant
 * suffix (`[aria-pressed="true"]`, `:focus-visible:disabled`, `:where(...)`, ` .child`) otherwise,
 * or null when the selector is not that utility (`.p-40` is not `.p-4`).
 */
function suffixAfterUtility(selector: string, prefixes: Set<string>): string | null {
	for (const prefix of prefixes) {
		if (!selector.startsWith(prefix)) continue;
		const suffix = selector.slice(prefix.length);
		if (suffix === "" || /^[:[ ,]/.test(suffix)) return suffix;
	}
	return null;
}

/**
 * `selector` with a requested utility's class replaced by `&`, for utilities that style other
 * elements and so wrap their class (`:where(.space-x-2 > :not(:last-child))`, `:is(.\*\:p-2 > *)`).
 * Only a whole class token matches (`.space-x-2` is not in `.space-x-20`); null when absent.
 */
function nestOnUtility(selector: string, prefixes: Set<string>): string | null {
	for (const prefix of prefixes) {
		for (let at = selector.indexOf(prefix); at !== -1; at = selector.indexOf(prefix, at + 1)) {
			const next = selector[at + prefix.length];
			if (next === undefined || !/[\w\\-]/.test(next)) {
				return `${selector.slice(0, at)}&${selector.slice(at + prefix.length)}`;
			}
		}
	}
	return null;
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
		if (body.length > 0) {
			if (selectorSet) {
				/* Keep the whole variant suffix: flattened attribute variants and chained pseudos. */
				const suffix = suffixAfterUtility(selector, selectorSet);
				if (suffix === "" || suffix?.startsWith(",")) result.push(body);
				else if (suffix !== null) result.push(`&${suffix} { ${body} }`);
				else {
					const nested = nestOnUtility(selector, selectorSet);
					if (nested !== null) result.push(`${nested} { ${body} }`);
				}
			} else {
				const pseudo = extractPseudo(selector);
				result.push(pseudo ? `&${pseudo} { ${body} }` : body);
			}
		}
		remaining = remaining.slice(i + 1).trim();
	}
	return result.join(";");
}

/**
 * The `@property` rules in a build output, keyed by variable name, whitespace-normalized
 * (`@property --tw-shadow { syntax: "*"; inherits: false; initial-value: 0 0 #0000; }`).
 * Utilities reference these locals with `var()`; without the registration (and its initial
 * value) a stack like `box-shadow: var(--tw-inset-shadow), …, var(--tw-shadow)` is invalid.
 */
export function extractPropertyRules(cssOutput: string): Map<string, string> {
	const rules = new Map<string, string>();
	for (const m of cssOutput.matchAll(/@property\s+(--[\w-]+)\s*\{([^}]*)\}/g)) {
		const decls = m[2]
			.split(";")
			.map((d) => d.trim().replace(/\s+/g, " "))
			.filter(Boolean);
		rules.set(m[1], `@property ${m[1]} { ${decls.map((d) => `${d};`).join(" ")} }`);
	}
	return rules;
}

function resolveThemeVars(css: string, themeVars: Map<string, string>): string {
	let result = css;
	for (let i = 0; i < 5; i++) {
		const next = result.replace(/var\((--[\w-]+)\)/g, (full, name: string) => {
			return isLocalVar(name) ? full : (themeVars.get(name) ?? full);
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

const TAILWIND_MODULE: string = "tailwindcss";

/** `@scope/name/sub/path` → `["@scope/name", "sub/path"]`; `name` → `["name", ""]`. */
function splitBareSpecifier(id: string): [string, string] {
	const parts = id.split("/");
	const nameParts = id.startsWith("@") ? 2 : 1;
	return [parts.slice(0, nameParts).join("/"), parts.slice(nameParts).join("/")];
}

/**
 * A bare CSS specifier from `fromDir`: a package root resolves to its `style` entry
 * (`exports["."].style`, then `style`); a subpath goes through the package's exports.
 */
function resolveBareStylesheet(id: string, fromDir: string): string {
	const req = createRequire(join(fromDir, "noop.css"));
	const [name, subpath] = splitBareSpecifier(id);
	if (subpath) return req.resolve(id);
	const pkgPath = req.resolve(`${name}/package.json`);
	const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
		exports?: Record<string, { style?: string } | string> | string;
		style?: string;
	};
	const rootExport = typeof pkg.exports === "object" ? pkg.exports["."] : undefined;
	const style = (typeof rootExport === "object" ? rootExport.style : undefined) ?? pkg.style;
	if (!style) throw new Error(`package "${name}" has no "style" entry to import as CSS`);
	return join(dirname(pkgPath), style);
}

/**
 * Where an `@import` points. Relative and absolute ids resolve against the importing
 * stylesheet's directory (`base`). Bare ids resolve from `base` like Node would, then from
 * Flare's own install (the optional `tailwindcss` peer usually sits beside Flare).
 */
export function resolveStylesheetPath(id: string, base: string): string {
	if (id.startsWith(".") || isAbsolute(id)) return resolve(base, id);
	try {
		return resolveBareStylesheet(id, base);
	} catch (fromBase) {
		try {
			return resolveBareStylesheet(id, dirname(fileURLToPath(import.meta.url)));
		} catch {
			throw new Error(
				`cannot resolve @import "${id}" from ${base}: ${fromBase instanceof Error ? fromBase.message : String(fromBase)}`,
				{ cause: fromBase },
			);
		}
	}
}

/**
 * Where an `@plugin` / `@config` module points: relative and absolute ids from the referencing
 * stylesheet's directory, bare ids through Node resolution from there, then from Flare's install.
 */
export function resolveModulePath(id: string, base: string): string {
	if (id.startsWith(".") || isAbsolute(id)) return resolve(base, id);
	try {
		return createRequire(join(base, "noop.js")).resolve(id);
	} catch (fromBase) {
		try {
			return createRequire(import.meta.url).resolve(id);
		} catch {
			throw new Error(
				`cannot resolve @plugin "${id}" from ${base}: ${fromBase instanceof Error ? fromBase.message : String(fromBase)}`,
				{ cause: fromBase },
			);
		}
	}
}

/**
 * Initialize a Tailwind v4 compiler from an optional CSS entry file. The entry's imports
 * resolve from its own directory (no entry: the process cwd). Throws on any failure —
 * callers fail the build, never fall back to pass-through.
 */
export async function initTailwindCompiler(cssPath?: string): Promise<TailwindCompiler> {
	const entry = cssPath ? resolve(cssPath) : undefined;
	try {
		/* Optional peer: a non-literal specifier keeps consumers without tailwindcss typechecking. */
		const tw = (await import(/* @vite-ignore */ TAILWIND_MODULE)) as { compile?: unknown; default?: unknown };
		const compileFn = tw.compile ?? (tw.default as { compile?: unknown })?.compile;
		if (typeof compileFn !== "function") {
			throw new Error(
				"tailwindcss compile function not found. Ensure tailwindcss ^4.0 is installed: bun add tailwindcss@latest",
			);
		}

		const cssContent = entry ? readFileSync(entry, "utf-8") : '@import "tailwindcss";';

		const compiler = await (
			compileFn as (
				css: string,
				opts?: unknown,
			) => Promise<{
				build: (classes: string[]) => string;
			}>
		)(cssContent, {
			/* Without `base`, Tailwind resolves the entry's own @imports against "" — the process cwd. */
			base: entry ? dirname(entry) : process.cwd(),
			loadStylesheet: (id: string, base: string) => {
				const path = resolveStylesheetPath(id, base);
				return { base: dirname(path), content: readFileSync(path, "utf-8"), path };
			},
			/* `@plugin` and `@config`: a plugin's default export (function or plugin object). */
			loadModule: async (id: string, base: string) => {
				const path = resolveModulePath(id, base);
				const mod = (await import(/* @vite-ignore */ pathToFileURL(path).href)) as { default?: unknown };
				return { base: dirname(path), module: mod.default ?? mod, path };
			},
		});

		const themeVars = new Map<string, string>();
		const originalBuild = compiler.build.bind(compiler);
		const trackingBuild = (classes: string[]): string => {
			const output = originalBuild(classes);
			for (const m of output.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) {
				if (!isLocalVar(m[1]) && !themeVars.has(m[1])) {
					themeVars.set(m[1], m[2].trim());
				}
			}
			return output;
		};

		return { build: trackingBuild, themeVars };
	} catch (e: unknown) {
		throw new Error(
			`Tailwind init failed for ${entry ?? 'the default @import "tailwindcss" entry'}: ${e instanceof Error ? e.message : String(e)}`,
			{ cause: e },
		);
	}
}
