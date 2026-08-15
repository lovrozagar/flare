import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
import { extractDeclarations, extractPrefaceCss, initTailwindCompiler } from "../tw-compile.ts";
import type { TailwindCompiler } from "../tw-compile.ts";
import { rewriteModule } from "./rewrite.ts";

export interface SxAstOptions {
	strict?: boolean;
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

const LAYER_PRELUDE = "@layer reset, sx, app, user.lib, user.app, inline;";

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

/** Compose the final CSS text from the class pool, wrapped in @layer blocks. */
function composeCss(
	classPool: Map<string, string>,
	layerByClass: Map<string, "sx" | "app">,
	skip: Set<string>,
	twPrefaceCss: string,
): string {
	const sxRules: string[] = [];
	const appRules: string[] = [];

	for (const [cls, rule] of classPool) {
		if (skip.has(cls)) continue;
		/* istanbul ignore next -- layerByClass is always set alongside classPool in cssEmit */
		const layer = layerByClass.get(cls) ?? "app";
		if (layer === "sx") sxRules.push(rule);
		else appRules.push(rule);
	}

	const parts: string[] = [];
	if (twPrefaceCss) parts.push(twPrefaceCss);
	parts.push(LAYER_PRELUDE);
	if (sxRules.length > 0) parts.push(`@layer sx { ${sxRules.join(" ")} }`);
	if (appRules.length > 0) parts.push(`@layer app { ${appRules.join(" ")} }`);

	return parts.join("\n");
}

const DEV_CSS_VIRTUAL_ID = "virtual:flare-sx-dev-css";
const DEV_CSS_RESOLVED_ID = "\0virtual:flare-sx-dev-css";

export function createSxAstPlugin(opts: SxAstOptions = {}, assetsBase: string = "/assets"): Plugin {
	const libPaths = opts.libPaths ?? ["/node_modules/"];
	/* On-disk dir mirrors URL prefix — emit must land where bundleHref points. */
	const assetsDir = assetsBase === "" ? "assets" : assetsBase.slice(1);
	const state: PluginState = {
		classPool: new Map(),
		layerByClass: new Map(),
		moduleManifest: new Map(),
		providedByLibs: new Set(),
		twCompiler: null,
		twPrefaceCss: "",
	};

	let mode: "dev" | "prod" = "dev";
	let root = process.cwd();

	return {
		async buildStart(this: { environment?: { config?: { root?: string } } }) {
			root = this.environment?.config?.root ?? process.cwd();
			if (opts.pruneFromLibManifests) {
				state.providedByLibs = scanLibManifests(root);
			}
			if ((opts.tw || opts.twCssPath) && state.twCompiler === null) {
				try {
					state.twCompiler = await initTailwindCompiler(opts.twCssPath);
					/* Zero-class build captures theme vars + preflight (base layer) verbatim. */
					state.twPrefaceCss = extractPrefaceCss(state.twCompiler.build([]));
				} catch (e) {
					/* Warn but don't fail the build — class= tokens pass through without CSS emit. */
					console.warn(`[flare:sx-ast] Tailwind compiler init failed: ${e instanceof Error ? e.message : String(e)}`);
				}
			}
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
			if (id !== DEV_CSS_RESOLVED_ID) return null;
			/* Each import() re-runs load — no caching — so SSR always gets latest state. */
			const css = composeCss(state.classPool, state.layerByClass, state.providedByLibs, state.twPrefaceCss);
			const classNames = [...state.classPool.keys()];
			return {
				code: `export function getDevSxCss() { return ${JSON.stringify(css)} }\nexport function getDevSxClasses() { return ${JSON.stringify(classNames)} }`,
				moduleType: "js",
			};
		},

		generateBundle() {
			const self = this as unknown as { emitFile: (f: { type: string; fileName: string; source: string }) => void };
			const css = composeCss(state.classPool, state.layerByClass, state.providedByLibs, state.twPrefaceCss);
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

		transform(code: string, id: string): { code: string; map: null } | null {
			if (!id.endsWith(".tsx") && !id.endsWith(".jsx")) return null;

			/* Quick filter — skip files that obviously have no relevant attrs */
			if (!code.includes("sx=") && !code.includes("css=") && !code.includes("class=")) return null;

			const layer = resolveLayer(id, libPaths, opts.layerOverride);
			const emittedForModule = new Set<string>();
			const moduleRules: Array<{ cls: string; rule: string }> = [];

			const tw = state.twCompiler;
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
				mode,
				sourcePath: id,
				twCompile: tw
					? (token: string) => {
							const output = tw.build([token]);
							return extractDeclarations(output, [token], tw.themeVars) || null;
						}
					: undefined,
			});

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
