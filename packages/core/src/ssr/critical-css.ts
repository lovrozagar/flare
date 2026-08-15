/** Manifest emitted by the sx-ast Vite plugin at build time. */
export interface SxCssManifest {
	version: 1;
	hashVersion: string;
	/** className → full CSS rule text (e.g. `.a1-abc12345 { color: red }`) */
	rules: Record<string, string>;
	/** Which layer each class belongs to. */
	layerByRule: Record<string, "sx" | "app">;
	/** moduleId → class names that module emits. Covers Show/Switch/handler branches. */
	moduleManifest: Record<string, string[]>;
	/** Final asset URL with Vite content hash. */
	bundleHref: string;
}

export interface CriticalCssResult {
	css: string;
	bundleHref?: string;
}

export const CRITICAL_SHEET_ID = "flare-critical";

/* Prod: a1-<8 base-36 chars>. Dev: sx-<prop>-<val>-<4 base-36 chars>. */
const ATOMIC_CLASS_RE = /\bclass="([^"]*)"/g;
const PROD_CLASS_RE = /^a1-[a-z0-9]{8}$/;
const DEV_CLASS_RE = /^sx-/;

function isAtomicClass(cls: string, manifestKeys?: Set<string>): boolean {
	/* Manifest keys are the ground truth — raw Tailwind tokens (e.g. bg-accent) are valid
	 * when the sx plugin emitted a rule for them (pass-through / non-hashed mode). */
	if (manifestKeys?.has(cls)) return true;
	return PROD_CLASS_RE.test(cls) || DEV_CLASS_RE.test(cls);
}

/** Scan rendered HTML and return the set of atomic/manifest class names present. */
export function collectAtomicClasses(html: string, manifest?: SxCssManifest): Set<string> {
	const manifestKeys = manifest ? new Set(Object.keys(manifest.rules)) : undefined;
	const found = new Set<string>();
	ATOMIC_CLASS_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = ATOMIC_CLASS_RE.exec(html)) !== null) {
		for (const cls of m[1].split(/\s+/)) {
			if (cls && isAtomicClass(cls, manifestKeys)) found.add(cls);
		}
	}
	return found;
}

/**
 * Compute critical CSS from rendered HTML + module manifest.
 *
 * Returns empty string when manifest absent — caller skips injection.
 */
export function buildCriticalCss(
	html: string,
	renderedModules: string[],
	manifest: SxCssManifest | undefined,
): CriticalCssResult {
	if (!manifest) return { css: "" };

	/* Union: classes from HTML + classes from module-manifest for loaded modules */
	const classes = collectAtomicClasses(html, manifest);
	for (const modId of renderedModules) {
		const modClasses = manifest.moduleManifest[modId];
		if (modClasses) {
			for (const cls of modClasses) classes.add(cls);
		}
	}

	const sxRules: string[] = [];
	const appRules: string[] = [];

	for (const cls of classes) {
		const rule = manifest.rules[cls];
		if (!rule) continue;

		const layer = manifest.layerByRule[cls] ?? "app";
		if (layer === "sx") sxRules.push(rule);
		else appRules.push(rule);
	}

	if (sxRules.length === 0 && appRules.length === 0) {
		return { bundleHref: manifest.bundleHref, css: "" };
	}

	const parts: string[] = [];
	/* Declare Tailwind's implicit layer order AND flare's sx/app layers before rules so
	 * browser positions `app` AFTER `base` (bundle registers same names later — same
	 * positions reused). Without these preludes the first `@layer app { }` encountered
	 * creates `app` at position 1 (lowest), causing base's `h1{font-size:inherit}` to
	 * beat `.text-4xl` and collapse typography. */
	parts.push("@layer theme, base, components, utilities;");
	parts.push("@layer reset, sx, app, user.lib, user.app, inline;");
	if (sxRules.length > 0) parts.push(`@layer sx { ${sxRules.join(" ")} }`);
	if (appRules.length > 0) parts.push(`@layer app { ${appRules.join(" ")} }`);

	return { bundleHref: manifest.bundleHref, css: parts.join("\n") };
}

/**
 * Inject empty critical-CSS placeholder + optional preload link before `</head>`.
 * Called during head-injection phase (before body is known).
 */
export function injectCriticalPlaceholder(html: string, nonce: string, bundleHref?: string): string {
	if (!html.includes("</head>")) return html;

	const nonceAttr = nonce ? ` nonce="${nonce}"` : "";
	let inject = `<style id="${CRITICAL_SHEET_ID}"${nonceAttr}></style>`;

	if (bundleHref) {
		const escapedHref = bundleHref.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
		inject += `<link rel="preload" as="style" href="${escapedHref}" onload="this.rel='stylesheet'"${nonceAttr}/>`;
	}

	return html.replace("</head>", `${inject}</head>`);
}

/**
 * Scan body HTML, compute critical CSS, fill the `<style id="flare-critical">`
 * placeholder in `<head>` (emitted upstream by injectHeadContent). Populating the
 * head placeholder keeps the critical sheet outside Solid's render tree; emitting
 * a fresh `<style>` near `</body>` left the tag as an unowned sibling that Solid's
 * post-hydrate cleanup disposed during SPA nav, stripping utilities off the page.
 */
export function injectCriticalAppend(
	html: string,
	renderedModules: string[],
	manifest: SxCssManifest | undefined,
	nonce: string,
): string {
	if (!manifest) return html;

	const { css } = buildCriticalCss(html, renderedModules, manifest);
	if (!css) return html;

	/* Escape </style> inside CSS to prevent tag injection */
	const safeCSS = css.replace(/<\/style\b/gi, "<\\/style");

	/* Fill the existing empty `<style id="flare-critical">…</style>` placeholder. */
	const filled = html.replace(
		/(<style id="flare-critical"[^>]*>)<\/style>/,
		(_match, open) => `${open}${safeCSS}</style>`,
	);
	if (filled !== html) return filled;

	/* Fallback: placeholder missing (non-standard head injection path) — keep the
	 * old behaviour of appending before `</body>` so we don't silently drop styles. */
	const nonceAttr = nonce ? ` nonce="${nonce}"` : "";
	const tag = `<style data-flare-critical-append${nonceAttr}>${safeCSS}</style>`;
	return html.replace("</body>", `${tag}</body>`);
}
