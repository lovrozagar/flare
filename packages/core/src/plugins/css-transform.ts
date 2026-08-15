import type { VitePlugin } from "./types.ts";

const THEME_RE = /@theme\s*\{/g;
const LAYER_RE = /@layer\s+(?:[\w-]+\s*)?\{/g;

/**
 * Strip @layer wrappers while preserving inner content.
 * Uses brace-depth tracking to find the correct closing brace.
 */
function stripLayerWrappers(css: string): string {
	let result = css;
	let match: RegExpExecArray | null = null;

	/* Process one @layer at a time since indices shift after each replacement */
	while (true) {
		LAYER_RE.lastIndex = 0;
		match = LAYER_RE.exec(result);
		if (!match) break;

		const openIdx = match.index;
		const afterOpen = openIdx + match[0].length;

		/* Find matching closing brace via depth tracking */
		let depth = 1;
		let closeIdx = -1;
		for (let i = afterOpen; i < result.length; i++) {
			if (result[i] === "{") depth++;
			else if (result[i] === "}") {
				depth--;
				if (depth === 0) {
					closeIdx = i;
					break;
				}
			}
		}

		if (closeIdx === -1) break;

		/* Replace: remove opening "@layer name {" and closing "}" */
		const inner = result.slice(afterOpen, closeIdx);
		result = result.slice(0, openIdx) + inner + result.slice(closeIdx + 1);
	}

	return result;
}

export function createCssTransformPlugin(): VitePlugin {
	return {
		name: "flare:css-transform",
		transform(code: string, id: string): { code: string; map: null } | null {
			if (!id.endsWith(".css")) return null;
			/* Vite virtualises inline <style> blocks in HTML as "?html-proxy" CSS modules.
			 * Stripping @layer from those removes the @layer reset wrapper injected by
			 * ResetCSS, making the Tailwind preflight unlayered and overriding all
			 * @layer app atomic-class rules on form elements (button, input, etc.). */
			if (id.includes("html-proxy")) return null;

			let transformed = code;

			/* @theme { ... } → :root { ... } */
			transformed = transformed.replace(THEME_RE, ":root {");

			/* @layer name { ... } → strip @layer wrapper, keep contents */
			transformed = stripLayerWrappers(transformed);

			if (transformed === code) return null;
			return { code: transformed, map: null };
		},
	};
}
