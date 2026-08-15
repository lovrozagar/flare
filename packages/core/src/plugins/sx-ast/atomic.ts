import type { Expression } from "oxc-parser";
import type { SxIR } from "./evaluator.ts";

export interface AtomicResult {
	classes: string[];
	cssRules: Map<string, string>;
	vars: Array<{ exprNode: Expression; index: number }>;
}

/** FNV-1a 32-bit hash over the input string. */
function fnv1a32(s: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
	}
	return h >>> 0;
}

function hash8(s: string): string {
	return fnv1a32(s).toString(36).padStart(8, "0").slice(-8);
}

function hash4(s: string): string {
	return hash8(s).slice(0, 4);
}

/*
 * Class name triple: selector\0property\0value.
 * Null-byte separators prevent `color:red` ↔ `col:or:red` collisions.
 */
function tripleKey(selector: string, prop: string, value: string): string {
	return `${selector}\0${prop}\0${value}`;
}

function className(selector: string, prop: string, value: string, mode: "dev" | "prod"): string {
	const key = tripleKey(selector, prop, value);
	if (mode === "prod") {
		return `a1-${hash8(key)}`;
	}
	/* dev: sx-<prop>-<value>-<hash4> — sanitize value for use in class name */
	const safeProp = prop.replace(/[^a-zA-Z0-9-]/g, "-");
	const safeVal = value.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 20);
	return `sx-${safeProp}-${safeVal}-${hash4(key)}`;
}

function toKebab(prop: string): string {
	/* Vendor prefixes: WebkitFoo → -webkit-foo, MozFoo → -moz-foo */
	return prop.replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`);
}

function expandSelector(parentSelector: string, sel: string): string {
	/* Replace & with parent, or prepend if no & */
	if (sel.includes("&")) return sel.replace(/&/g, parentSelector);
	return `${parentSelector}${sel}`;
}

/*
 * Wraps any pseudo-class/pseudo-element and attribute modifier portions of a
 * selector in `:where()` so that specificity stays at (0,1,0) — matching
 * the base-rule class selector. Without this, `.cls:hover` (0,2,0) would
 * permanently beat `.cls2` (0,1,0) on the same element, even when not hovered.
 * Within an @layer the last rule with equal specificity wins, so source order
 * (base first, modifiers last) correctly governs override priority.
 */
function wrapModifiersInWhere(sel: string): string {
	/* sel is already fully expanded, e.g. `.a1-xxx:hover:focus-visible` or
	 * `.a1-xxx[data-size="lg"]`. Split off the leading class selector, then
	 * wrap the remainder. If there's no remainder (bare class), return as-is. */
	/* Walk from char 1 to find the first pseudo/attr modifier after the class */
	let splitAt = sel.length;
	for (let i = 1; i < sel.length; i++) {
		const c = sel[i];
		if (c === ":" || c === "[") {
			splitAt = i;
			break;
		}
	}
	if (splitAt === sel.length) return sel;
	const base = sel.slice(0, splitAt);
	const modifier = sel.slice(splitAt);
	return `${base}:where(${modifier})`;
}

interface EmitCtx {
	classes: string[];
	cssRules: Map<string, string>;
	mode: "dev" | "prod";
	varCounter: { n: number };
	vars: Array<{ exprNode: Expression; index: number }>;
}

function emitDeclarations(ctx: EmitCtx, cssSelector: string, base: SxIR["base"], atWrap?: string): void {
	for (const [prop, cv] of Object.entries(base)) {
		let value: string;
		if (cv.kind === "dynamic") {
			const idx = ctx.varCounter.n++;
			ctx.vars.push({ exprNode: cv.exprNode, index: idx });
			value = `var(--_${idx})`;
		} else {
			value = cv.text;
		}

		const cssProp = toKebab(prop);
		const cls = className(cssSelector, cssProp, value, ctx.mode);
		ctx.classes.push(cls);

		if (ctx.cssRules.has(cls)) continue;

		/*
		 * Base: `.cls { prop: value }`.
		 * Modified (pseudo/attr): wrap modifiers in `:where()` so all rules share
		 * (0,1,0) specificity — source order within @layer governs overrides.
		 */
		let rule: string;
		if (cssSelector === "") {
			rule = `.${cls} { ${cssProp}: ${value} }`;
		} else {
			const resolved = wrapModifiersInWhere(expandSelector(`.${cls}`, cssSelector));
			rule = `${resolved} { ${cssProp}: ${value} }`;
		}

		if (atWrap) {
			rule = `${atWrap} { ${rule} }`;
		}

		ctx.cssRules.set(cls, rule);
	}
}

function emitIR(ctx: EmitCtx, ir: SxIR, parentSelector = "", atWrap?: string): void {
	/* Base declarations */
	emitDeclarations(ctx, parentSelector, ir.base, atWrap);

	/* Nested selectors */
	for (const { body, sel } of ir.selectors) {
		const resolved = parentSelector === "" ? sel : expandSelector(parentSelector, sel);
		emitIR(ctx, body, resolved, atWrap);
	}

	/* At-rules */
	for (const { at, body } of ir.atRules) {
		emitIR(ctx, body, parentSelector, at);
	}

	/* Variants: data-attr selector */
	for (const [varName, varValues] of Object.entries(ir.variants)) {
		for (const [varValue, bodyIR] of Object.entries(varValues)) {
			const varSel = `[data-${varName}="${varValue}"]`;
			const combined = parentSelector === "" ? `&${varSel}` : `${parentSelector}${varSel}`;
			emitIR(ctx, bodyIR, combined, atWrap);
		}
	}
}

/** Convert an SxIR to atomic class names + CSS rules. */
export function emitAtomic(ir: SxIR, mode: "dev" | "prod"): AtomicResult {
	const ctx: EmitCtx = {
		classes: [],
		cssRules: new Map(),
		mode,
		varCounter: { n: 0 },
		vars: [],
	};
	emitIR(ctx, ir);
	return { classes: ctx.classes, cssRules: ctx.cssRules, vars: ctx.vars };
}
