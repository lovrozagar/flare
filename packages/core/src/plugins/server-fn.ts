import { createHash, randomBytes } from "node:crypto";
import { readdirSync, readFileSync, statSync, watch } from "node:fs";
import { join } from "node:path";
import MagicString from "magic-string";
import { parseSync } from "oxc-parser";
import { extractParenContent, findMatchingBraceSimple } from "./parse-utils.ts";
import type { VitePlugin } from "./types.ts";

const GEN_IGNORE_RE = /(_gen[/\\]|\.gen\.tsx?$)/;

/* ── Environment Function Transforms ─────────────────────────────────── */

const ENV_FN_RE = /create(ServerOnly|ClientOnly|Isomorphic)Fn/;

const SERVER_ONLY_STUB = '((..._) => { throw new Error("Server-only function called on client") })';
const CLIENT_ONLY_STUB = '((..._) => { throw new Error("Client-only function called on server") })';
const NOOP_STUB = "(() => undefined)";

/**
 * Transform createServerOnlyFn / createClientOnlyFn / createIsomorphicFn.
 * - Env-only fns: keep implementation on correct env, replace with throwing stub on other.
 * - Isomorphic fns: extract the env-specific `.server()` or `.client()` branch.
 */
export function transformEnvFns(code: string, isSSR: boolean): string {
	let result = "";
	let cursor = 0;

	while (cursor < code.length) {
		/* find next env-fn call */
		const serverOnlyIdx = code.indexOf("createServerOnlyFn(", cursor);
		const clientOnlyIdx = code.indexOf("createClientOnlyFn(", cursor);
		const isomorphicIdx = code.indexOf("createIsomorphicFn(", cursor);

		/* pick earliest match */
		const candidates = [
			{ idx: serverOnlyIdx, type: "server-only" as const },
			{ idx: clientOnlyIdx, type: "client-only" as const },
			{ idx: isomorphicIdx, type: "isomorphic" as const },
		].filter((c) => c.idx !== -1);

		if (candidates.length === 0) {
			result += code.slice(cursor);
			break;
		}

		candidates.sort((a, b) => a.idx - b.idx);
		const match = candidates[0];

		/* ── createServerOnlyFn(fn) / createClientOnlyFn(fn) ── */
		if (match.type === "server-only" || match.type === "client-only") {
			const token = match.type === "server-only" ? "createServerOnlyFn(" : "createClientOnlyFn(";
			const parenStart = match.idx + token.length - 1;
			const extracted = extractParenContent(code, parenStart);
			if (!extracted) {
				result += code.slice(cursor, match.idx + token.length);
				cursor = match.idx + token.length;
				continue;
			}

			const [innerFn, endIdx] = extracted;
			result += code.slice(cursor, match.idx);

			const keepOriginal = (match.type === "server-only" && isSSR) || (match.type === "client-only" && !isSSR);

			if (keepOriginal) {
				result += `(${innerFn})`;
			} else {
				result += match.type === "server-only" ? SERVER_ONLY_STUB : CLIENT_ONLY_STUB;
			}

			cursor = endIdx + 1;
			continue;
		}

		/* ── createIsomorphicFn().server(fn).client(fn) ── */
		const isoToken = "createIsomorphicFn(";
		const parenStart = match.idx + isoToken.length - 1;
		const initExtracted = extractParenContent(code, parenStart);
		if (!initExtracted) {
			result += code.slice(cursor, match.idx + isoToken.length);
			cursor = match.idx + isoToken.length;
			continue;
		}

		/* after the initial `()`, scan for .server() and .client() calls */
		let scanPos = initExtracted[1] + 1;
		let serverFnBody: string | null = null;
		let clientFnBody: string | null = null;
		let chainEnd = scanPos;

		for (let pass = 0; pass < 2; pass++) {
			/* skip whitespace */
			while (scanPos < code.length && /\s/.test(code[scanPos])) scanPos++;

			const serverMatch = code.startsWith(".server(", scanPos);
			const clientMatch = code.startsWith(".client(", scanPos);

			if (serverMatch) {
				const p = extractParenContent(code, scanPos + ".server".length);
				if (p) {
					serverFnBody = p[0];
					scanPos = p[1] + 1;
					chainEnd = scanPos;
				} else break;
			} else if (clientMatch) {
				const p = extractParenContent(code, scanPos + ".client".length);
				if (p) {
					clientFnBody = p[0];
					scanPos = p[1] + 1;
					chainEnd = scanPos;
				} else break;
			} else break;
		}

		result += code.slice(cursor, match.idx);

		if (isSSR) {
			result += serverFnBody ? `(${serverFnBody})` : NOOP_STUB;
		} else {
			result += clientFnBody ? `(${clientFnBody})` : NOOP_STUB;
		}

		cursor = chainEnd;
	}

	return result;
}

/* ── Server Function Plugin ──────────────────────────────────────────── */

const SERVER_FN_START = "createServerFn({";

/** Replace all `createServerFn({...})` with `__id`-injected versions using proper brace matching */
export function replaceServerFnConfigs(code: string, replacer: (configContent: string) => string): string {
	let result = "";
	let cursor = 0;

	while (cursor < code.length) {
		const idx = code.indexOf(SERVER_FN_START, cursor);
		if (idx === -1) {
			result += code.slice(cursor);
			break;
		}

		result += code.slice(cursor, idx);
		const braceStart = idx + SERVER_FN_START.length - 1;
		const braceEnd = findMatchingBraceSimple(code, braceStart);
		const configContent = code.slice(braceStart + 1, braceEnd);

		/* Verify closing `)` after the `}` */
		if (braceEnd + 1 < code.length && code[braceEnd + 1] === ")") {
			result += `createServerFn({${replacer(configContent)}})`;
			cursor = braceEnd + 2;
		} else {
			/* Not a valid createServerFn call — skip */
			result += SERVER_FN_START;
			cursor = idx + SERVER_FN_START.length;
		}
	}

	return result;
}

function hasServerFnCalls(code: string): boolean {
	return code.includes(SERVER_FN_START);
}
const HANDLER_RE = /\.(handler|stream)\s*\(/;
const buildSecret = randomBytes(32).toString("hex");

function computeFnId(fileId: string, fnContent: string): string {
	const hash = createHash("sha256");
	hash.update(fileId);
	hash.update(fnContent);
	return hash.digest("hex").slice(0, 8);
}

/**
 * Scan directory recursively for .ts/.tsx files containing createServerFn.
 * Returns absolute paths of matching files.
 */
export function scanServerFnFiles(srcDir: string): string[] {
	const results: string[] = [];

	function walk(dir: string): void {
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			return;
		}

		for (const entry of entries) {
			const full = join(dir, entry);
			/* skip generated files and _gen dirs */
			if (GEN_IGNORE_RE.test(entry)) continue;
			if (entry.startsWith("_gen")) continue;

			let stat: ReturnType<typeof statSync> | undefined;
			try {
				stat = statSync(full);
			} catch {
				continue;
			}

			if (stat.isDirectory()) {
				walk(full);
			} else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
				try {
					const content = readFileSync(full, "utf-8");
					if (content.includes("createServerFn")) {
						results.push(full.replace(/\\/g, "/"));
					}
				} catch {
					/* skip unreadable files */
				}
			}
		}
	}

	walk(srcDir);
	return results.sort();
}

/**
 * Generate the virtual module source that collects all server fn registrations.
 */
export function generateServerFnMapSource(files: string[]): string {
	if (files.length === 0) {
		return "export default new Map()";
	}

	const lines: string[] = [];
	for (let i = 0; i < files.length; i++) {
		lines.push(`import * as _m${i} from "${files[i]}"`);
	}

	lines.push("");
	lines.push("const map = new Map()");
	lines.push("const _names = new Map()");
	lines.push("function _c(mod) {");
	lines.push("  for (const v of Object.values(mod)) {");
	lines.push('    if (v && typeof v === "function" && v._registration) {');
	lines.push("      const r = v._registration");
	lines.push("      map.set(r.id, r)");
	lines.push("      _names.set(r.name, (_names.get(r.name) || 0) + 1)");
	lines.push("    }");
	lines.push("  }");
	lines.push("}");
	lines.push("function _n() {");
	lines.push("  for (const [, r] of map) {");
	lines.push("    if (r.id !== r.name && _names.get(r.name) === 1) map.set(r.name, r)");
	lines.push("  }");
	lines.push("}");

	for (let i = 0; i < files.length; i++) {
		lines.push(`_c(_m${i})`);
	}
	lines.push("_n()");

	lines.push("export default map");
	return lines.join("\n");
}

/**
 * Drop import declarations whose every binding is unreferenced in the post-transform body.
 * Runs after `transformEnvFns` and `stripHandlerBodies`. The transforms delete code regions
 * (env-fn branches, handler closures) but leave their imports intact; Vite dev does not
 * tree-shake so the imports survive into the client bundle. For modules like
 * `flare/server-context` that do `import { AsyncLocalStorage } from "node:async_hooks"`
 * at top level, the surviving import triggers Vite's `node:*` browser shim and crashes the page.
 *
 * Whole-import drops only — partial-specifier removal is out of scope. Side-effect imports
 * (`import "x"` with no specifiers) are always kept.
 */
export function dropDeadImports(code: string, id: string): string {
	let parsed: ReturnType<typeof parseSync>;
	try {
		parsed = parseSync(id, code, { lang: id.endsWith(".tsx") || id.endsWith(".jsx") ? "tsx" : "ts" });
	} catch {
		return code;
	}
	if (parsed.errors.length > 0) return code;

	interface ImportInfo {
		bindings: string[];
		end: number;
		start: number;
	}
	const imports: ImportInfo[] = [];

	for (const stmt of parsed.program.body) {
		if (stmt.type !== "ImportDeclaration") continue;
		const bindings: string[] = [];
		for (const spec of stmt.specifiers ?? []) {
			if (
				spec.type === "ImportDefaultSpecifier" ||
				spec.type === "ImportNamespaceSpecifier" ||
				spec.type === "ImportSpecifier"
			) {
				bindings.push(spec.local.name);
			}
		}
		/* side-effect-only imports (no specifiers) — always keep, may execute side effects */
		if (bindings.length === 0) continue;
		imports.push({ bindings, end: stmt.end, start: stmt.start });
	}

	if (imports.length === 0) return code;

	/* Scan the whole file minus import declarations. Solid's JSX compiler
	   emits `_$template(...)` *between* import groups; slicing after the last
	   import treats that usage as dead and drops `template as _$template`. */
	const usageScan = stripCommentsAndStrings(code);
	const usageMasked = usageScan.split("");
	for (const imp of imports) {
		for (let i = imp.start; i < imp.end && i < usageMasked.length; i++) {
			usageMasked[i] = " ";
		}
	}
	const usedCode = usageMasked.join("");

	const ms = new MagicString(code);
	let removed = false;
	for (const imp of imports) {
		const allUnused = imp.bindings.every((name) => {
			const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
			return !re.test(usedCode);
		});
		if (allUnused) {
			ms.remove(imp.start, imp.end);
			/* drop trailing newline if present so we don't accumulate blank lines */
			if (code[imp.end] === "\n") ms.remove(imp.end, imp.end + 1);
			removed = true;
		}
	}

	return removed ? ms.toString() : code;
}

/** Replace block comments, line comments, and string literals with whitespace-equivalent placeholders. */
function stripCommentsAndStrings(code: string): string {
	let result = "";
	let i = 0;
	while (i < code.length) {
		const ch = code[i];
		const next = code[i + 1];
		/* block comment */
		if (ch === "/" && next === "*") {
			const end = code.indexOf("*/", i + 2);
			const stop = end === -1 ? code.length : end + 2;
			result += " ".repeat(stop - i);
			i = stop;
			continue;
		}
		/* line comment */
		if (ch === "/" && next === "/") {
			const end = code.indexOf("\n", i);
			const stop = end === -1 ? code.length : end;
			result += " ".repeat(stop - i);
			i = stop;
			continue;
		}
		/* string literal — single, double, or template */
		if (ch === '"' || ch === "'" || ch === "`") {
			const quote = ch;
			result += quote;
			i++;
			while (i < code.length) {
				const c = code[i];
				if (c === "\\") {
					result += "  ";
					i += 2;
					continue;
				}
				if (c === quote) {
					result += quote;
					i++;
					break;
				}
				if (quote === "`" && c === "$" && code[i + 1] === "{") {
					/* template expression — keep as-is to allow identifier scanning inside */
					result += "${";
					i += 2;
					let depth = 1;
					while (i < code.length && depth > 0) {
						const cc = code[i];
						if (cc === "{") depth++;
						else if (cc === "}") depth--;
						if (depth === 0) {
							result += "}";
							i++;
							break;
						}
						result += cc;
						i++;
					}
					continue;
				}
				result += " ";
				i++;
			}
			continue;
		}
		result += ch;
		i++;
	}
	return result;
}

/**
 * Strip .handler(fn) closure body for client builds.
 * Preserves _registration (client needs id, name, method for RPC).
 * Uses paren-depth tracking to find matching closing paren.
 */
export function stripHandlerBodies(code: string): string {
	let result = "";
	let cursor = 0;

	while (cursor < code.length) {
		const handlerIdx = code.indexOf(".handler(", cursor);
		const streamIdx = code.indexOf(".stream(", cursor);

		/* pick whichever comes first, skip -1 (not found) */
		let idx: number;
		let token: string;
		if (handlerIdx === -1 && streamIdx === -1) {
			result += code.slice(cursor);
			break;
		}
		if (handlerIdx === -1) {
			idx = streamIdx;
			token = ".stream(";
		} else if (streamIdx === -1) {
			idx = handlerIdx;
			token = ".handler(";
		} else if (handlerIdx <= streamIdx) {
			idx = handlerIdx;
			token = ".handler(";
		} else {
			idx = streamIdx;
			token = ".stream(";
		}

		/* include everything up to and including the token */
		const handlerStart = idx + token.length;
		result += code.slice(cursor, handlerStart);

		/* find matching closing paren via depth tracking (string-aware) */
		let depth = 1;
		let i = handlerStart;
		for (; i < code.length; i++) {
			const ch = code[i];
			/* Skip string literals */
			if (ch === '"' || ch === "'") {
				const q = ch;
				i++;
				while (i < code.length && code[i] !== q) {
					if (code[i] === "\\") i++;
					i++;
				}
				continue;
			}
			/* Skip template literals */
			if (ch === "`") {
				i++;
				while (i < code.length && code[i] !== "`") {
					if (code[i] === "\\") i++;
					else if (code[i] === "$" && i + 1 < code.length && code[i + 1] === "{") {
						/* Skip ${...} expression inside template (simple depth tracking) */
						i += 2;
						let tDepth = 1;
						while (i < code.length && tDepth > 0) {
							if (code[i] === "{") tDepth++;
							else if (code[i] === "}") tDepth--;
							if (tDepth > 0) i++;
						}
					}
					i++;
				}
				continue;
			}
			/* Skip block comments */
			if (ch === "/" && i + 1 < code.length && code[i + 1] === "*") {
				i += 2;
				while (i < code.length - 1 && !(code[i] === "*" && code[i + 1] === "/")) i++;
				i++;
				continue;
			}
			/* Skip line comments */
			if (ch === "/" && i + 1 < code.length && code[i + 1] === "/") {
				i += 2;
				while (i < code.length && code[i] !== "\n") i++;
				continue;
			}
			if (ch === "(") depth++;
			else if (ch === ")") {
				depth--;
				if (depth === 0) break;
			}
		}

		/* replace inner content with no-op stub */
		result += '() => { throw new Error("Server function called on client") }';
		cursor = i;
	}

	return result;
}

export function createServerFnPlugin(_config?: { ignorePrefix?: string }): VitePlugin {
	let serverFnFiles: string[] = [];

	/* track vite dev server for HMR invalidation */
	let devServer:
		| {
				config?: { root?: string };
				environments?: Record<
					string,
					{
						moduleGraph?: {
							invalidateModule?: (mod: unknown) => void;
							getModuleById?: (id: string) => unknown;
						};
					}
				>;
				httpServer?: { on?: (event: string, fn: () => void) => void } | null;
		  }
		| undefined;

	return {
		buildStart(this: { environment?: { config?: { root?: string } } }) {
			const root = this.environment?.config?.root ?? process.cwd();
			const srcDir = join(root, "src");
			serverFnFiles = scanServerFnFiles(srcDir);
		},
		configureServer(server: unknown) {
			devServer = server as typeof devServer;
			const root = devServer?.config?.root ?? process.cwd();
			const srcDir = join(root, "src");
			let debounceTimer: ReturnType<typeof setTimeout> | undefined;

			const watcher = watch(srcDir, { recursive: true }, (_event, filename) => {
				if (!filename) return;
				const name = String(filename);
				if (GEN_IGNORE_RE.test(name)) return;
				if (!name.endsWith(".ts") && !name.endsWith(".tsx")) return;

				clearTimeout(debounceTimer);
				debounceTimer = setTimeout(() => {
					const prev = serverFnFiles;
					serverFnFiles = scanServerFnFiles(srcDir);

					/* invalidate virtual module if file set changed */
					if (prev.length !== serverFnFiles.length || prev.some((f, idx) => f !== serverFnFiles[idx])) {
						const ssrEnv = devServer?.environments?.["ssr"];
						const mod = ssrEnv?.moduleGraph?.getModuleById?.("\0virtual:flare-server-fn-map");
						if (mod) {
							ssrEnv?.moduleGraph?.invalidateModule?.(mod);
						}
					}
				}, 150);
			});

			devServer?.httpServer?.on?.("close", () => {
				clearTimeout(debounceTimer);
				watcher.close();
			});
			return undefined;
		},
		load(id: string): { code: string; moduleType: string } | null {
			if (id === "\0virtual:flare-server-fn-secret") {
				return { code: `export default "${buildSecret}"`, moduleType: "js" };
			}
			if (id === "\0virtual:flare-server-fn-map") {
				return { code: generateServerFnMapSource(serverFnFiles), moduleType: "js" };
			}
			return null;
		},
		name: "flare:server-fn",
		resolveId(this: { environment?: { name?: string } }, id: string): string | null {
			if (id === "virtual:flare-server-fn-secret") {
				/* SSR-only: secret must never leak to client bundles */
				const env = this.environment?.name ?? "client";
				if (env !== "ssr") return null;
				return "\0virtual:flare-server-fn-secret";
			}
			if (id === "virtual:flare-server-fn-map") {
				/* SSR-only: return null for client env so map is not bundled */
				const env = this.environment?.name ?? "client";
				if (env !== "ssr") return null;
				return "\0virtual:flare-server-fn-map";
			}
			return null;
		},
		transform(this: { environment?: { name?: string } }, code: string, id: string): { code: string; map: null } | null {
			const env = this.environment?.name ?? "client";
			const isSSR = env === "ssr";
			let transformed = code;
			let changed = false;

			/* env-fn transforms: both environments (skip the runtime implementation itself) */
			if (ENV_FN_RE.test(transformed) && !id.includes("/env-fn/")) {
				transformed = transformEnvFns(transformed, isSSR);
				changed = true;
			}

			/* handler stripping: client-only transform */
			if (!isSSR && HANDLER_RE.test(transformed) && transformed.includes("createServerFn")) {
				/* inject __id first */
				if (hasServerFnCalls(transformed)) {
					transformed = replaceServerFnConfigs(transformed, (content) => {
						const fnId = computeFnId(id, content);
						return ` __id: "${fnId}",${content}`;
					});
				}

				/* strip handler bodies */
				transformed = stripHandlerBodies(transformed);
				/* After body strips, sweep imports unused by remaining code — keeps node:* deps
				   (e.g. flare/server-context → node:async_hooks) out of the client bundle. */
				transformed = dropDeadImports(transformed, id);
				return { code: transformed, map: null };
			}

			/* SSR: only inject __id for server fns */
			if (hasServerFnCalls(transformed)) {
				transformed = replaceServerFnConfigs(transformed, (content) => {
					const fnId = computeFnId(id, content);
					return ` __id: "${fnId}",${content}`;
				});
				changed = true;
			}

			if (changed) {
				transformed = dropDeadImports(transformed, id);
				return { code: transformed, map: null };
			}
			return null;
		},
	};
}
