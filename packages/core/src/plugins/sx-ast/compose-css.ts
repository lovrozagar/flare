/*
 * Stylesheet composition shared by the build (flare-global.css) and the dev SSR runtime
 * (virtual:flare-sx-dev-css imports this file into the server runner). No Node imports.
 */

export const LAYER_PRELUDE = "@layer reset, sx, app, user.lib, user.app, inline;";

/* Tailwind's fallback for browsers without @property: the same initial values, set directly. */
const PROPERTIES_SUPPORTS =
	"((-webkit-hyphens: none) and (not (margin-trim: inline))) or ((-moz-orient: inline) and (not (color:rgb(from red r g b))))";

/** Tailwind's element-local stacks (`--tw-shadow`, `--tw-scale-x`, …): never theme values. */
export function isLocalVar(name: string): boolean {
	return name.startsWith("--tw-");
}

function propertiesFallback(properties: Map<string, string>): string {
	const decls = [...properties].map(([name, rule]) => {
		const initial = /initial-value:\s*([^;]+);/.exec(rule);
		return `${name}: ${initial ? initial[1].trim() : "initial"};`;
	});
	return `@layer properties { @supports ${PROPERTIES_SUPPORTS} { *, ::before, ::after, ::backdrop { ${decls.join(" ")} } } }`;
}

/* At-rules last so @media utilities beat earlier base utilities of equal
 * specificity. classPool insertion order is first-seen across the whole
 * build, so a later page's `fontSize: 12px` would otherwise override an
 * earlier `@media (min-width: 1px) { fontSize: 24px }`. */
function atLast(a: string, b: string): number {
	return Number(a.trimStart().startsWith("@")) - Number(b.trimStart().startsWith("@"));
}

/** Compose the final CSS text from the class pool, wrapped in @layer blocks. */
export function composeCss(
	classPool: Map<string, string>,
	layerByClass: Map<string, "sx" | "app">,
	skip: Set<string>,
	twPrefaceCss: string,
	properties: Map<string, string> = new Map(),
	themeBlock = "",
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

	sxRules.sort(atLast);
	appRules.sort(atLast);

	const parts: string[] = [];
	/* First statement, so the fallback layer ranks below every other layer. */
	if (properties.size > 0) parts.push("@layer properties;");
	if (twPrefaceCss) parts.push(twPrefaceCss);
	if (themeBlock) parts.push(themeBlock);
	parts.push(LAYER_PRELUDE);
	if (sxRules.length > 0) parts.push(`@layer sx { ${sxRules.join(" ")} }`);
	if (appRules.length > 0) parts.push(`@layer app { ${appRules.join(" ")} }`);
	if (properties.size > 0) {
		parts.push(...properties.values());
		parts.push(propertiesFallback(properties));
	}

	return parts.join("\n");
}

/**
 * `@layer theme { :root, :host { … } }` defining the theme vars `referenced` needs: each one and,
 * transitively, the vars its value references. Locals (`--tw-*`), vars the preface already defines,
 * and names Tailwind never emitted are skipped. Empty string when nothing is needed.
 */
export function themeVarsBlock(referenced: Set<string>, themeVars: Map<string, string>, preface: string): string {
	const decls: string[] = [];
	const seen = new Set<string>();
	const queue = [...referenced];
	while (queue.length > 0) {
		const name = queue.shift() as string;
		if (seen.has(name) || isLocalVar(name)) continue;
		seen.add(name);
		if (new RegExp(`${name.replace(/[-]/g, "\\-")}\\s*:`).test(preface)) continue;
		const value = themeVars.get(name);
		if (value === undefined) continue;
		decls.push(`${name}: ${value};`);
		for (const m of value.matchAll(/var\((--[\w-]+)/g)) queue.push(m[1]);
	}
	return decls.length > 0 ? `@layer theme { :root, :host { ${decls.join(" ")} } }` : "";
}
