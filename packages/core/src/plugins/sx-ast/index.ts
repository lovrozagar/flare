import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, ViteDevServer } from "vite";
import { createThemeCn } from "../cn-theme.ts";
import type { ThemeCn } from "../cn-theme.ts";
import { extractDeclarations, extractPrefaceCss, extractPropertyRules, initTailwindCompiler } from "../tw-compile.ts";
import type { TailwindCompiler } from "../tw-compile.ts";
import { composeCss, themeVarsBlock } from "./compose-css.ts";
import { rewriteModule } from "./rewrite.ts";

export interface SxStrictOptions {
	/** Tokens that may compile to no CSS (non-Tailwind classes such as `prose`). Markers (`group`, `peer`) are always allowed. */
	allow?: string[];
	/** Tokens rejected even when they compile (e.g. physical-direction utilities). */
	deny?: RegExp[];
}

export interface SxAstOptions {
	/**
	 * Fail the module (build error, dev overlay) when an app-layer class literal compiles to no CSS
	 * or matches a `deny` pattern. Library-layer modules are not checked. Requires Tailwind (`tw`/`twCssPath`).
	 */
	strict?: boolean | SxStrictOptions;
	/**
	 * How utilities reference theme values. `"inline"` (default) resolves them to their values at
	 * build time. `"reference"` keeps `var(--…)` and emits the referenced theme vars, so a page can
	 * change the theme at runtime (live theme editors).
	 */
	themeVars?: "inline" | "reference";
	/** Absolute path prefixes that map to the "sx" layer (lib code). Default: ["/node_modules/"]. */
	libPaths?: string[];
	/** Override layer detection per module id. Return null to fall back to libPaths heuristic. */
	layerOverride?: (id: string) => "sx" | "app" | null;
	/** Emit flare-sx-manifest.json alongside CSS — for lib builds. */
	manifest?: boolean;
	/** Emit one .css asset per transformed component module — for lib builds. */
	perComponent?: boolean;
	/**
	 * Scan node_modules (and workspace-linked packages) for flare-sx-manifest.json files at
	 * buildStart and omit any classes already provided by those libs from this build's CSS output.
	 * Prevents duplicate atomic rules when a lib and its consumer both run the sx plugin.
	 */
	pruneFromLibManifests?: boolean;
	/**
	 * Absolute path to a Tailwind CSS entry file (e.g. `src/tailwind.css`).
	 * When provided, the plugin compiles Tailwind utility tokens found in `class=` attributes.
	 * Omit to disable Tailwind compilation (pass-through mode).
	 */
	twCssPath?: string;
	/**
	 * Enable Tailwind compilation using the default `@import "tailwindcss"` entry.
	 * Ignored when `twCssPath` is set. Set to `true` to enable with default config.
	 */
	tw?: boolean;
}

/** CSS rule pool accumulated across all transforms in a build. */
interface PluginState {
	/** className → CSS rule text */
	classPool: Map<string, string>;
	/** className → which @layer it belongs to */
	layerByClass: Map<string, "sx" | "app">;
	/** moduleId → emitted class names */
	moduleManifest: Map<string, Set<string>>;
	/** Classes already shipped by upstream libs — excluded from this build's CSS output. */
	providedByLibs: Set<string>;
	/** Tailwind compiler instance, null if not initialized or init failed. */
	twCompiler: TailwindCompiler | null;
	/**
	 * Full Tailwind preamble (theme + base/preflight layers) from a zero-class build.
	 * Emitted verbatim before atomic utility rules so browser defaults are normalized.
	 */
	twPrefaceCss: string;
	/** `@property` rules for the Tailwind locals the emitted utilities use, by variable name. */
	properties: Map<string, string>;
	/** themeVars "reference": theme vars the emitted utilities reference. */
	referencedVars: Set<string>;
}

interface LibManifestShape {
	classes?: string[];
	rules?: Record<string, unknown>;
}

/**
 * Scan node_modules for packages that published a flare-sx-manifest.json.
 * Checks both `<pkg>/flare-sx-manifest.json` and `<pkg>/dist/flare-sx-manifest.json`.
 * Returns the union of all class names found.
 */
function scanLibManifests(root: string): Set<string> {
	const provided = new Set<string>();
	const nmDir = join(root, "node_modules");
	if (!existsSync(nmDir)) return provided;

	let pkgNames: string[];
	try {
		pkgNames = readdirSync(nmDir);
	} catch {
		return provided;
	}

	for (const pkg of pkgNames) {
		/* Scoped packages live one level deeper */
		if (pkg.startsWith("@")) {
			const scopeDir = join(nmDir, pkg);
			let scoped: string[];
			try {
				scoped = readdirSync(scopeDir);
			} catch {
				continue;
			}
			for (const name of scoped) {
				collectFromPkg(join(scopeDir, name), provided);
			}
		} else {
			collectFromPkg(join(nmDir, pkg), provided);
		}
	}

	return provided;
}

function collectFromPkg(pkgDir: string, out: Set<string>): void {
	for (const rel of ["flare-sx-manifest.json", "dist/flare-sx-manifest.json"]) {
		const p = join(pkgDir, rel);
		try {
			const raw = readFileSync(p, "utf-8");
			const m = JSON.parse(raw) as LibManifestShape;
			/* Support both {classes:[]} and {rules:{cls:rule}} manifest shapes */
			if (Array.isArray(m.classes)) {
				for (const cls of m.classes) out.add(cls);
			} else if (m.rules && typeof m.rules === "object") {
				for (const cls of Object.keys(m.rules)) out.add(cls);
			}
		} catch {
			/* package doesn't have a manifest — fine */
		}
	}
}

function resolveLayer(
	id: string,
	libPaths: string[],
	override: ((id: string) => "sx" | "app" | null) | undefined,
): "sx" | "app" {
	if (override) {
		const result = override(id);
		if (result !== null) return result;
	}
	for (const prefix of libPaths) {
		if (id.includes(prefix)) return "sx";
	}
	return "app";
}

/* Flare's own `cn` tables module. With a twCssPath, the plugin serves tables compiled from that
   theme in its place, so `cn` merges the app's custom scale names (`rounded-control`). */
const CN_TABLES_RE = /[\\/]styles[\\/]cn-vendor[\\/]tables\.generated\.ts(?:\?.*)?$/;

function lineOf(code: string, token: string): number {
	const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const m = new RegExp(`(?<![\\w:/-])${escaped}(?![\\w-])`).exec(code);
	return m ? code.slice(0, m.index).split("\n").length : 1;
}

const DEV_CSS_VIRTUAL_ID = "virtual:flare-sx-dev-css";
const DEV_CSS_RESOLVED_ID = "\0virtual:flare-sx-dev-css";

export function createSxAstPlugin(opts: SxAstOptions = {}, assetsBase: string = "/assets"): Plugin {
	const libPaths = opts.libPaths ?? ["/node_modules/"];
	const strict: SxStrictOptions | null = opts.strict ? (opts.strict === true ? {} : opts.strict) : null;
	const strictAllow = new Set(strict?.allow ?? []);
	/* On-disk dir mirrors URL prefix — emit must land where bundleHref points. */
	const assetsDir = assetsBase === "" ? "assets" : assetsBase.slice(1);
	const state: PluginState = {
		classPool: new Map(),
		layerByClass: new Map(),
		moduleManifest: new Map(),
		providedByLibs: new Set(),
		twCompiler: null,
		twPrefaceCss: "",
		properties: new Map(),
		referencedVars: new Set(),
	};
	const referenceVars = opts.themeVars === "reference";
	/*
	 * Dev SSR stylesheet: a registry living in the server runtime. Every module the server
	 * transforms registers its rules when it runs (see transform), so the stylesheet SSR reads
	 * at render time covers every module evaluated so far. A snapshot of plugin state baked into
	 * this module would go stale: the runner caches the module after its first import, while the
	 * pool keeps growing as later routes are first rendered. Composition is shared with the build.
	 */
	const devCssModule = (): string => {
		const themeVars = referenceVars && state.twCompiler ? [...state.twCompiler.themeVars] : null;
		const composeCssPath = fileURLToPath(new URL("./compose-css.ts", import.meta.url));
		return `import { composeCss, themeVarsBlock } from ${JSON.stringify(composeCssPath)};
const rules = new Map();
const layers = new Map();
const properties = new Map();
const referenced = new Set();
const skip = new Set(${JSON.stringify([...state.providedByLibs])});
const preface = ${JSON.stringify(state.twPrefaceCss)};
const themeVars = ${themeVars ? `new Map(${JSON.stringify(themeVars)})` : "null"};
export function registerDevSx(moduleRules, moduleProperties, moduleReferenced) {
	for (const [cls, rule, layer] of moduleRules) {
		rules.set(cls, rule);
		layers.set(cls, layer);
	}
	for (const [name, rule] of moduleProperties) properties.set(name, rule);
	for (const name of moduleReferenced) referenced.add(name);
}
export function getDevSxCss() {
	return composeCss(rules, layers, skip, preface, properties, themeVars ? themeVarsBlock(referenced, themeVars, preface) : "");
}
export function getDevSxClasses() {
	return [...rules.keys()];
}
`;
	};
	const themeBlockOf = (): string =>
		referenceVars && state.twCompiler
			? themeVarsBlock(state.referencedVars, state.twCompiler.themeVars, state.twPrefaceCss)
			: "";

	let mode: "dev" | "prod" = "dev";
	let root = process.cwd();
	let themeCn: ThemeCn | null = null;
	let devServer: ViteDevServer | null = null;
	const themeCnFor = (): ThemeCn | null => {
		if (!opts.twCssPath) return null;
		if (!themeCn) {
			themeCn = createThemeCn(resolve(opts.twCssPath));
			devServer?.watcher.add(themeCn.files);
		}
		return themeCn;
	};
	/* Throws on failure: a broken Tailwind entry fails the build (non-zero exit) instead of
	   shipping class= tokens with no CSS behind them. */
	const loadTw = async (): Promise<void> => {
		const compiler = await initTailwindCompiler(opts.twCssPath);
		/* Zero-class build captures theme vars + preflight (base layer) verbatim. */
		state.twPrefaceCss = extractPrefaceCss(compiler.build([]));
		state.twCompiler = compiler;
	};

	return {
		async buildStart(this: { environment?: { config?: { root?: string } } }) {
			root = this.environment?.config?.root ?? process.cwd();
			if (opts.pruneFromLibManifests) {
				state.providedByLibs = scanLibManifests(root);
			}
			if ((opts.tw || opts.twCssPath) && state.twCompiler === null) await loadTw();
		},

		configureServer(server) {
			devServer = server;
			if (themeCn) server.watcher.add(themeCn.files);
			/* A theme edit changes both the CSS every utility compiles to and the cn merge tables:
			   drop both, forget emitted rules, and re-transform every module from scratch. */
			server.watcher.on("change", async (file) => {
				if (!themeCn?.files.includes(resolve(file))) return;
				try {
					await loadTw();
				} catch (e) {
					server.config.logger.error(`[flare:sx-ast] ${e instanceof Error ? e.message : String(e)}`);
					return;
				}
				themeCn = null;
				state.classPool.clear();
				state.layerByClass.clear();
				state.moduleManifest.clear();
				state.properties.clear();
				state.referencedVars.clear();
				server.moduleGraph.invalidateAll();
				server.ws.send({ type: "full-reload" });
			});
		},

		configResolved(config) {
			mode = config.command === "build" ? "prod" : "dev";
			root = config.root ?? process.cwd();
		},

		enforce: "pre",

		resolveId(id: string): string | null {
			if (id === DEV_CSS_VIRTUAL_ID) return DEV_CSS_RESOLVED_ID;
			return null;
		},

		load(id: string): { code: string; moduleType: string } | null {
			if (CN_TABLES_RE.test(id)) {
				const theme = themeCnFor();
				return theme ? { code: theme.source, moduleType: "js" } : null;
			}
			if (id !== DEV_CSS_RESOLVED_ID) return null;
			return { code: devCssModule(), moduleType: "js" };
		},

		generateBundle() {
			const self = this as unknown as { emitFile: (f: { type: string; fileName: string; source: string }) => void };
			const css = composeCss(
				state.classPool,
				state.layerByClass,
				state.providedByLibs,
				state.twPrefaceCss,
				state.properties,
				themeBlockOf(),
			);
			self.emitFile({ fileName: `${assetsDir}/flare-global.css`, source: css, type: "asset" });

			if (opts.manifest) {
				const rules: Record<string, string> = {};
				const layerByRule: Record<string, "sx" | "app"> = {};
				for (const [cls, rule] of state.classPool) {
					if (state.providedByLibs.has(cls)) continue;
					rules[cls] = rule;
					/* istanbul ignore next -- layerByClass always set alongside classPool */
					layerByRule[cls] = state.layerByClass.get(cls) ?? "app";
				}
				const moduleManifest: Record<string, string[]> = {};
				for (const [modId, clsSet] of state.moduleManifest) {
					const filtered = [...clsSet].filter((c) => !state.providedByLibs.has(c));
					if (filtered.length > 0) moduleManifest[modId] = filtered;
				}
				const manifest = {
					/* bundleHref resolved at runtime from Vite manifest — placeholder during build */
					bundleHref: `${assetsBase}/flare-global.css`,
					hashVersion: "a1",
					layerByRule,
					moduleManifest,
					rules,
					version: 1,
				};
				self.emitFile({
					fileName: "flare-sx-manifest.json",
					source: JSON.stringify(manifest),
					type: "asset",
				});
			}
		},

		name: "flare:sx-ast",

		transform(
			this: { environment?: { config?: { consumer?: string } } },
			code: string,
			id: string,
			options?: { ssr?: boolean },
		): { code: string; map: null } | null {
			if (!id.endsWith(".tsx") && !id.endsWith(".jsx")) return null;

			/* Quick filter — skip files that obviously have no relevant attrs */
			if (!code.includes("sx=") && !code.includes("css=") && !code.includes("class=")) return null;

			const layer = resolveLayer(id, libPaths, opts.layerOverride);
			const emittedForModule = new Set<string>();
			const moduleRules: Array<{ cls: string; rule: string }> = [];
			const moduleProperties = new Map<string, string>();
			const moduleReferenced = new Set<string>();

			const tw = state.twCompiler;
			const violations: string[] = [];
			const result = rewriteModule(code, {
				cssEmit: (rule) => {
					/*
					 * Extract the first class selector from the rule regardless of wrapping.
					 * At-rule wrapped rules (`@media (...) { .cls { ... } }`) have their `.cls`
					 * after the opening brace — the leading-dot-only regex missed those entirely.
					 * Match the first `.cls` followed by whitespace, `{`, `[`, or `:`.
					 */
					const m = rule.match(/\.((?:[a-zA-Z0-9_-]|\\[^a-zA-Z0-9_-])+?)[\s{[:]/);
					/* istanbul ignore next -- emitAtomic always produces .cls-prefixed rules */
					const cls = m ? m[1].replace(/\\/g, "") : rule.slice(0, 40);
					state.classPool.set(cls, rule);
					state.layerByClass.set(cls, layer);
					emittedForModule.add(cls);
					moduleRules.push({ cls, rule });
				},
				layer,
				mergeClassList: themeCnFor()?.mergeString,
				onClassToken:
					strict && layer === "app"
						? (token, compiled) => {
								if (!compiled && !strictAllow.has(token)) {
									violations.push(`${id}:${lineOf(code, token)} "${token}" compiles to no CSS`);
								}
								const denied = strict.deny?.find((re) => re.test(token));
								if (denied) violations.push(`${id}:${lineOf(code, token)} "${token}" matches deny ${denied}`);
							}
						: undefined,
				mode,
				sourcePath: id,
				twCompile: tw
					? (token: string) => {
							const output = tw.build([token]);
							for (const [name, rule] of extractPropertyRules(output)) {
								state.properties.set(name, rule);
								moduleProperties.set(name, rule);
							}
							const decls = extractDeclarations(output, [token], referenceVars ? undefined : tw.themeVars);
							if (referenceVars) {
								for (const m of decls.matchAll(/var\((--[\w-]+)/g)) {
									state.referencedVars.add(m[1]);
									moduleReferenced.add(m[1]);
								}
							}
							return decls || null;
						}
					: undefined,
			});

			if (violations.length > 0) {
				throw new Error(
					`[flare:sx-ast] sx.strict rejected ${violations.length} class token(s):\n  ${violations.join("\n  ")}`,
				);
			}

			/* Track which classes this module emitted; layer already set in cssEmit above */
			if (result !== null) {
				for (const cls of result.emittedClasses) {
					emittedForModule.add(cls);
					/* c8 ignore next -- static sx always passes through cssEmit first, setting layerByClass */
					if (!state.layerByClass.has(cls)) state.layerByClass.set(cls, layer);
				}
			}
			if (emittedForModule.size > 0) {
				state.moduleManifest.set(id, emittedForModule);
			}

			/*
			 * Dev mode: inject atomic CSS directly into a <style> element at module execution time.
			 * registerCSSAsClass is guarded by domInjectionEnabled (set after hydration) and
			 * would silently drop rules emitted at module import time. Direct DOM injection
			 * bypasses that gate — safe because dev mode never SSR-hydrates the style sheet.
			 * In build mode, rules land in flare-global.css via generateBundle.
			 *
			 * result === null means the AST needed no code rewrite (pure class= literals, no sx/spread).
			 * CSS was still collected into moduleRules via cssEmit — must still inject the snippet.
			 */
			if (
				mode === "dev" &&
				moduleRules.length > 0 &&
				(options?.ssr || this.environment?.config?.consumer === "server")
			) {
				/* Server runtime: register into the dev stylesheet SSR reads at render (devCssModule). */
				const registration = JSON.stringify([
					moduleRules.map(({ cls, rule }) => [cls, rule, layer]),
					[...moduleProperties],
					[...moduleReferenced],
				]);
				const baseCode = result !== null ? result.code : code;
				return {
					code: `${baseCode}\nimport { registerDevSx as __flareRegisterDevSx__ } from "${DEV_CSS_VIRTUAL_ID}";\n__flareRegisterDevSx__(...${registration});\n`,
					map: null,
				};
			}

			if (mode === "dev" && moduleRules.length > 0) {
				const layerName: "sx" | "app" = layer;
				const perClassJson = JSON.stringify(moduleRules.map(({ cls, rule }) => [cls, rule]));
				/* SSR pre-populates flare-sx-dev with the full atomic payload for the page, plus
				 * twPrefaceCss (theme vars + base preflight) and the @layer prelude. Every client
				 * module import used to re-append ALL its scanned rules, stacking duplicates —
				 * one module's .hidden then landed after another's md:flex, killing `hidden md:flex`.
				 *
				 * Fix: SSR seeds `window.__flare_sx_classes__` with the full class pool before any
				 * module runs. Module inject snippets skip classes already in the Set. Only new
				 * classes (e.g. modules loaded after SPA nav to a fresh route) get appended. No
				 * destructive sheet reset — SSR-emitted theme + preflight + layer prelude stay
				 * intact. */
				const injectSnippet = `
if (typeof document !== "undefined") {
  const __seen__ = (window.__flare_sx_classes__ ||= new Set());
  let __buf__ = "";
  for (const [__c__, __r__] of ${perClassJson}) {
    if (__seen__.has(__c__)) continue;
    __seen__.add(__c__);
    __buf__ += "@layer ${layerName}{" + __r__ + "}";
  }
  if (__buf__) {
    let __sx_el__ = document.getElementById("flare-sx-dev");
    if (!__sx_el__) {
      __sx_el__ = document.createElement("style");
      __sx_el__.id = "flare-sx-dev";
      document.head.appendChild(__sx_el__);
    }
    __sx_el__.textContent += __buf__;
  }
}`;
				const baseCode = result !== null ? result.code : code;
				return { code: `${baseCode}\n${injectSnippet}`, map: null };
			}

			if (result === null) return null;
			return { code: result.code, map: null };
		},

		/*
		 * Inject an empty <style id="flare-sx-dev"> placeholder into HTML head in dev mode.
		 * Works regardless of which SSR plugin (CF Workers, Nitro, built-in) handles requests —
		 * the placeholder is in the DOM before any module runs, so the per-module JS snippets
		 * that do `__sx_el__.textContent +=` always find the element via getElementById.
		 */
		transformIndexHtml(html: string): string {
			if (mode !== "dev") return html;
			if (!html.includes("</head>")) return html;
			const prefaceTag = state.twPrefaceCss ? `<style id="flare-tw-preface">${state.twPrefaceCss}</style>` : "";
			return html.replace("</head>", `${prefaceTag}<style id="flare-sx-dev"></style></head>`);
		},
	};
}
