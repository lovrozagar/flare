import { warn } from "../logger.ts";

declare const __FLARE_IS_DEV__: boolean | undefined;
const isDev = typeof __FLARE_IS_DEV__ === "boolean" ? __FLARE_IS_DEV__ : process.env.NODE_ENV !== "production";
import type { Sx } from "./sx-types.ts";

export type { ClassValue, Sx } from "./sx-types.ts";

type CSSProperties = Record<string, string>;

interface StylesResult {
	"data-c": string;
	style?: CSSProperties;
	[key: `data-${string}`]: string;
}

type StateSelectors<S> = {
	[K in keyof S]: (value: S[K]) => string;
};

type VarAccessors<V> = {
	[K in keyof V]: string;
};

interface StylesConfigFull<S extends Record<string, unknown>, V extends Record<string, unknown>> {
	css?: ((s: StateSelectors<S>, v: VarAccessors<V>) => string) | string;
	outerCss?: string;
	state?: S;
	style?: CSSProperties;
	tw?: string;
	vars?: V;
}

type StylesConfig<S extends Record<string, unknown>, V extends Record<string, unknown>> =
	| StylesConfigFull<S, V>
	| string;

export const RUNTIME_SHEET_ID = "flare-runtime";
const RT_CLASS_PREFIX = "flare-rt-";

let maxRegistrySize = 5000;

/** @internal visible for testing only */
export function __setMaxRegistrySize(size: number): void {
	maxRegistrySize = size;
}
const registry = new Map<string, string>();
let domInjectionEnabled = false;
let ssrSheetPresent = false;

export function enableDomInjection(): void {
	domInjectionEnabled = true;
	if (typeof document !== "undefined") {
		const el = document.getElementById(RUNTIME_SHEET_ID) as HTMLStyleElement | null;
		ssrSheetPresent = el !== null && (el.sheet?.cssRules?.length ?? 0) > 0;
	}
}

export function finishHydration(): void {
	ssrSheetPresent = false;
}

function hashString(str: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) {
		h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
	}
	h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
	return (h >>> 0).toString(36);
}

function escapeCSSAttrValue(v: string): string {
	return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

const T_IDENT = 0;
const T_COLON = 1;
const T_SEMI = 2;
const T_LBRACE = 3;
const T_RBRACE = 4;
const T_STRING = 5;
const T_WS = 6;
const T_AT = 7;
const T_DELIM = 8;
const T_FUNC = 9;
const T_RPAREN = 10;
const T_EOF = 11;
const T_BAD_STRING = 12;
const T_BAD_COMMENT = 13;

type Token = { t: number; v: string };

function isIdentChar(c: string): boolean {
	return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") || c === "_" || c === "-";
}

function tokenizeCSS(css: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;

	while (i < css.length) {
		const ch = css[i];

		/* whitespace */
		if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
			i++;
			while (i < css.length && (css[i] === " " || css[i] === "\t" || css[i] === "\n" || css[i] === "\r")) i++;
			tokens.push({ t: T_WS, v: " " });
			continue;
		}

		/* block comments */
		if (ch === "/" && i + 1 < css.length && css[i + 1] === "*") {
			i += 2;
			let closed = false;
			while (i < css.length - 1) {
				if (css[i] === "*" && css[i + 1] === "/") {
					closed = true;
					i += 2;
					break;
				}
				i++;
			}
			if (!closed) {
				tokens.push({ t: T_BAD_COMMENT, v: "" });
				break;
			}
			continue;
		}

		/* strings */
		if (ch === '"' || ch === "'") {
			const q = ch;
			let val = q;
			i++;
			let closed = false;
			while (i < css.length) {
				if (css[i] === "\\") {
					val += css[i];
					i++;
					if (i < css.length) {
						val += css[i];
						i++;
					}
					continue;
				}
				if (css[i] === q) {
					val += q;
					i++;
					closed = true;
					break;
				}
				val += css[i];
				i++;
			}
			tokens.push({ t: closed ? T_STRING : T_BAD_STRING, v: val });
			continue;
		}

		/* punctuation */
		if (ch === ":") {
			tokens.push({ t: T_COLON, v: ":" });
			i++;
			continue;
		}
		if (ch === ";") {
			tokens.push({ t: T_SEMI, v: ";" });
			i++;
			continue;
		}
		if (ch === "{") {
			tokens.push({ t: T_LBRACE, v: "{" });
			i++;
			continue;
		}
		if (ch === "}") {
			tokens.push({ t: T_RBRACE, v: "}" });
			i++;
			continue;
		}
		if (ch === ")") {
			tokens.push({ t: T_RPAREN, v: ")" });
			i++;
			continue;
		}
		if (ch === "@") {
			let val = "@";
			i++;
			while (i < css.length && isIdentChar(css[i])) {
				val += css[i];
				i++;
			}
			tokens.push({ t: T_AT, v: val });
			continue;
		}

		/* ident or function (ident followed by '(') */
		if (isIdentChar(ch)) {
			let val = "";
			while (i < css.length && isIdentChar(css[i])) {
				val += css[i];
				i++;
			}
			if (i < css.length && css[i] === "(") {
				val += "(";
				i++;
				tokens.push({ t: T_FUNC, v: val });
			} else {
				tokens.push({ t: T_IDENT, v: val });
			}
			continue;
		}

		/* anything else: & . # ( , + ~ > [ ] ! % = etc */
		tokens.push({ t: T_DELIM, v: ch });
		i++;
	}

	tokens.push({ t: T_EOF, v: "" });
	return tokens;
}

function validateCSS(name: string, css: string): void {
	const trimmed = css.trim();
	if (trimmed.length === 0) return;

	const tokens = tokenizeCSS(trimmed);

	/* check for tokenizer-level errors */
	for (const tok of tokens) {
		if (tok.t === T_BAD_STRING) {
			warn("styles", `"${name}": unclosed string literal`);
			return;
		}
		if (tok.t === T_BAD_COMMENT) {
			warn("styles", `"${name}": unclosed comment`);
			return;
		}
	}

	/* check brace balance */
	let braceDepth = 0;
	for (const tok of tokens) {
		if (tok.t === T_LBRACE) braceDepth++;
		else if (tok.t === T_RBRACE) braceDepth--;
	}
	if (braceDepth !== 0) {
		warn("styles", `"${name}": unbalanced braces (depth ${braceDepth})`);
	}

	/* validate declarations at each brace depth */
	validateTokenDeclarations(name, tokens);
}

function validateTokenDeclarations(name: string, tokens: Token[]): void {
	let i = 0;

	while (i < tokens.length && tokens[i].t !== T_EOF) {
		const tok = tokens[i];

		if (tok.t === T_WS) {
			i++;
			continue;
		}
		if (tok.t === T_LBRACE) {
			i++;
			continue;
		}
		if (tok.t === T_RBRACE) {
			i++;
			continue;
		}
		if (tok.t === T_SEMI) {
			i++;
			continue;
		}

		/* skip @ rules at current depth — advance past their block or to next ; */
		if (tok.t === T_AT) {
			i++;
			while (i < tokens.length && tokens[i].t !== T_LBRACE && tokens[i].t !== T_SEMI && tokens[i].t !== T_EOF) i++;
			continue;
		}

		/* skip selectors (& . # or ident followed by { without colon) */
		if (tok.t === T_DELIM && (tok.v === "&" || tok.v === "." || tok.v === "#" || tok.v === "[")) {
			while (i < tokens.length && tokens[i].t !== T_LBRACE && tokens[i].t !== T_SEMI && tokens[i].t !== T_EOF) i++;
			continue;
		}

		/* expect a declaration: IDENT WS? COLON value... SEMI */
		if (tok.t === T_IDENT || (tok.t === T_DELIM && tok.v === "*")) {
			const propName = tok.v;
			i++;
			/* skip whitespace */
			while (i < tokens.length && tokens[i].t === T_WS) i++;

			/* expect colon */
			if (i >= tokens.length || tokens[i].t === T_EOF) break;
			if (tokens[i].t !== T_COLON) {
				/* no colon — might be a selector like `p { ... }` or `from { ... }` */
				/* only treat as selector if a { exists before ; or EOF */
				let hasBrace = false;
				for (let s = i; s < tokens.length && tokens[s].t !== T_SEMI && tokens[s].t !== T_EOF; s++) {
					if (tokens[s].t === T_LBRACE) {
						hasBrace = true;
						break;
					}
				}
				if (hasBrace) {
					while (i < tokens.length && tokens[i].t !== T_LBRACE && tokens[i].t !== T_SEMI && tokens[i].t !== T_EOF) i++;
					continue;
				}
				warn("styles", `"${name}": declaration missing colon after "${propName}"`);
				while (i < tokens.length && tokens[i].t !== T_SEMI && tokens[i].t !== T_RBRACE && tokens[i].t !== T_EOF) i++;
				continue;
			}
			i++; /* skip colon */

			/* skip whitespace after colon */
			while (i < tokens.length && tokens[i].t === T_WS) i++;

			/* check for empty value */
			if (i < tokens.length && (tokens[i].t === T_SEMI || tokens[i].t === T_RBRACE || tokens[i].t === T_EOF)) {
				warn("styles", `"${name}": empty value in declaration "${propName}:"`);
				continue;
			}

			/* consume value tokens, watching for missing semicolon pattern */
			let parenDepth = 0;
			while (i < tokens.length && tokens[i].t !== T_SEMI && tokens[i].t !== T_RBRACE && tokens[i].t !== T_EOF) {
				if (tokens[i].t === T_FUNC || (tokens[i].t === T_DELIM && tokens[i].v === "(")) {
					parenDepth++;
				} else if (tokens[i].t === T_RPAREN) {
					if (parenDepth > 0) parenDepth--;
				}

				/* missing semicolon heuristic: IDENT followed by COLON outside parens */
				if (parenDepth === 0 && tokens[i].t === T_IDENT) {
					/* look ahead past optional whitespace for colon */
					let peek = i + 1;
					while (peek < tokens.length && tokens[peek].t === T_WS) peek++;
					if (peek < tokens.length && tokens[peek].t === T_COLON) {
						warn("styles", `"${name}": missing semicolon before "${tokens[i].v}"`);
						break;
					}
				}

				i++;
			}
			if (i < tokens.length && tokens[i].t === T_SEMI) i++;
			continue;
		}

		/* skip anything else */
		i++;
	}
}

const MAX_CSS_SIZE = 512 * 1024;

/**
 * Match a CSS functional pseudo-selector that wraps a nested rule.
 * Handles `:where(`, `:is(`, `:has(`, `:not(` — CSS nesting constructs
 * emitted by Tailwind v4 for utilities like `space-y-*`, `divide-*`.
 */
const NESTED_PSEUDO_RE = /^:(where|is|has|not)\(/;

function scopeCSS(name: string, css: string): string {
	if (css.length > MAX_CSS_SIZE) {
		warn("styles", `CSS for ${name} exceeds ${MAX_CSS_SIZE} bytes, skipping`);
		return "";
	}
	const selector = `[data-c="${escapeCSSAttrValue(name)}"]`;
	const trimmed = css.trim();
	if (trimmed.length === 0) return "";

	const rules: string[] = [];
	let remaining = trimmed;

	while (remaining.length > 0) {
		remaining = remaining.trim();
		if (remaining.length === 0) break;

		if (remaining.startsWith("@keyframes")) {
			/* pass through unscoped */
			const braceStart = remaining.indexOf("{");
			if (braceStart === -1) break;
			const end = findMatchingBrace(remaining, braceStart);
			rules.push(remaining.slice(0, end + 1));
			remaining = remaining.slice(end + 1);
			continue;
		}

		if (remaining.startsWith("@")) {
			/* at-rules: wrap content with scope */
			const braceStart = remaining.indexOf("{");
			if (braceStart === -1) break;
			const atRule = remaining.slice(0, braceStart).trim();
			const end = findMatchingBrace(remaining, braceStart);
			const content = remaining.slice(braceStart + 1, end).trim();
			const scopedContent = scopeBlock(name, content);
			rules.push(`${atRule} { ${scopedContent} }`);
			remaining = remaining.slice(end + 1);
			continue;
		}

		if (remaining.startsWith("&")) {
			/* & rule */
			const braceStart = remaining.indexOf("{");
			if (braceStart === -1) break;
			const selectorPart = remaining.slice(0, braceStart).trim();
			const end = findMatchingBrace(remaining, braceStart);
			const body = remaining.slice(braceStart + 1, end).trim();
			const replaced = selectorPart.replace(/&/g, selector);
			rules.push(`${replaced} { ${body} }`);
			remaining = remaining.slice(end + 1);
			continue;
		}

		/*
		 * CSS nesting: `:where(& > ...)`, `:is(&...)`, `:has(&...)`, `:not(&...)`
		 * These are functional pseudo-selectors wrapping `&`-relative selectors.
		 * Tailwind v4 emits these for space-y-*, divide-*, etc.
		 * Find the matching `)`, then the `{`, treat as a scoped selector block.
		 */
		if (NESTED_PSEUDO_RE.test(remaining)) {
			const braceStart = findBraceAfterMatchingParen(remaining);
			if (braceStart !== -1) {
				const selectorPart = remaining.slice(0, braceStart).trim();
				const end = findMatchingBrace(remaining, braceStart);
				const body = remaining.slice(braceStart + 1, end).trim();
				const replaced = selectorPart.replace(/&/g, selector);
				rules.push(`${replaced} { ${body} }`);
				remaining = remaining.slice(end + 1);
				continue;
			}
		}

		/* check if this is a rule with braces (non-& selector) */
		const braceIdx = remaining.indexOf("{");
		const semiIdx = remaining.indexOf(";");
		if (braceIdx !== -1 && (semiIdx === -1 || braceIdx < semiIdx)) {
			/* has braces before semicolon — it's a rule block */
			const end = findMatchingBrace(remaining, braceIdx);
			const body = remaining.slice(braceIdx + 1, end).trim();
			const selectorPrefix = remaining.slice(0, braceIdx).trim();
			if (selectorPrefix.includes("&")) {
				const replaced = selectorPrefix.replace(/&/g, selector);
				rules.push(`${replaced} { ${body} }`);
			} else {
				rules.push(`${selector} ${selectorPrefix} { ${body} }`);
			}
			remaining = remaining.slice(end + 1);
			continue;
		}

		/* plain declarations — collect up to next rule-like construct */
		const nextAt = findUnquotedChar(remaining, "@");
		const nextAmp = findUnquotedChar(remaining, "&");
		/*
		 * Find nested pseudo-selector starts (:where, :is, :has, :not) in remaining.
		 * These need to be treated as rule boundaries — the `&` inside them is NOT
		 * a standalone `&` rule start.
		 */
		const nextNestedPseudo = findNestedPseudoStart(remaining);
		/* Find next selector block: look for `{` preceded by a non-declaration context */
		let nextRuleStart = -1;
		for (let scan = 0; scan < remaining.length; scan++) {
			const c = remaining[scan];
			if (c === "{") {
				/* Walk back to find the start of the selector */
				let selStart = scan - 1;
				while (selStart >= 0 && remaining[selStart] === " ") selStart--;
				/* If preceded by a semicolon or start-of-string, there's a selector before the brace */
				if (selStart >= 0) {
					/* Find the start of this selector (after last ; or start) */
					let lineStart = remaining.lastIndexOf(";", selStart);
					lineStart = lineStart === -1 ? 0 : lineStart + 1;
					const candidateSel = remaining.slice(lineStart, scan).trim();
					/* If it looks like a selector (contains . or & or alphabetic start), split here */
					if (candidateSel.length > 0 && /^[.&#@a-zA-Z:[]/.test(candidateSel)) {
						nextRuleStart = lineStart;
						break;
					}
				}
			}
		}

		/*
		 * Prefer nested pseudo position over raw `&` — a `&` inside `:where(&...)`
		 * is not a standalone `&` rule start, the split should be at the `:where(`.
		 */
		let effectiveAmp = nextAmp;
		if (nextNestedPseudo > 0 && (effectiveAmp === -1 || nextNestedPseudo <= effectiveAmp)) {
			effectiveAmp = -1;
		}

		/* Also consider @ and & positions */
		const candidates = [nextAt, effectiveAmp, nextRuleStart, nextNestedPseudo].filter((n) => n > 0);
		if (candidates.length > 0) {
			const splitAt = Math.min(...candidates);
			const declPart = remaining.slice(0, splitAt).trim();
			if (declPart.length > 0) {
				rules.push(`${selector} { ${declPart} }`);
			}
			remaining = remaining.slice(splitAt);
			continue;
		}

		rules.push(`${selector} { ${remaining} }`);
		break;
	}

	return rules.join("\n");
}

/**
 * Find the `{` that follows the matching `)` of a functional pseudo-selector.
 * E.g. for `:where(& > :not(:last-child)) { ... }`, returns the index of `{`.
 */
function findBraceAfterMatchingParen(str: string): number {
	const openParen = str.indexOf("(");
	if (openParen === -1) return -1;
	let depth = 1;
	let i = openParen + 1;
	for (; i < str.length; i++) {
		if (str[i] === "(") depth++;
		else if (str[i] === ")") {
			depth--;
			if (depth === 0) break;
		}
	}
	if (depth !== 0) return -1;
	/* Skip whitespace after `)`, expect `{` */
	i++;
	while (i < str.length && (str[i] === " " || str[i] === "\t" || str[i] === "\n")) i++;
	return i < str.length && str[i] === "{" ? i : -1;
}

/**
 * Find the first `:where(`, `:is(`, `:has(`, or `:not(` that contains `&`,
 * signaling a CSS nesting construct. Returns the position of the `:` or -1.
 */
function findNestedPseudoStart(str: string): number {
	let i = 0;
	while (i < str.length) {
		if (str[i] === ":" && i + 1 < str.length) {
			const after = str.slice(i + 1);
			const m = after.match(/^(where|is|has|not)\(/);
			if (m) {
				/* Verify this pseudo contains `&` (it's a nesting construct, not a plain pseudo) */
				const parenStart = i + 1 + m[1].length;
				let depth = 1;
				let j = parenStart + 1;
				let hasAmp = false;
				for (; j < str.length; j++) {
					if (str[j] === "(") depth++;
					else if (str[j] === ")") {
						depth--;
						if (depth === 0) break;
					} else if (str[j] === "&") {
						hasAmp = true;
					}
				}
				if (hasAmp) return i;
			}
		}
		i++;
	}
	return -1;
}

/* Delegate to scopeCSS so at-rule bodies get full rule-level parsing (no blind & replace in values) */
function scopeBlock(name: string, content: string): string {
	return scopeCSS(name, content);
}

function findMatchingBrace(str: string, start: number): number {
	let depth = 0;
	for (let i = start; i < str.length; i++) {
		const ch = str[i];
		/* Skip string literals (handles escaped quotes) */
		if (ch === '"' || ch === "'") {
			const quote = ch;
			i++;
			while (i < str.length && str[i] !== quote) {
				if (str[i] === "\\") i++;
				i++;
			}
			continue;
		}
		/* Skip block comments */
		if (ch === "/" && i + 1 < str.length && str[i + 1] === "*") {
			i += 2;
			while (i < str.length - 1 && !(str[i] === "*" && str[i + 1] === "/")) {
				i++;
			}
			i++;
			continue;
		}
		/* Skip unquoted url() content — braces inside url() are not CSS block braces */
		if (ch === "u" && str.slice(i, i + 4) === "url(") {
			i += 4;
			/* If url starts with quote, string-skipping above handles the content */
			if (i < str.length && (str[i] === '"' || str[i] === "'")) {
				const quote = str[i];
				i++;
				while (i < str.length && str[i] !== quote) {
					if (str[i] === "\\") i++;
					i++;
				}
				/* skip closing quote */
				if (i < str.length) i++;
			} else {
				/* Unquoted url — skip until closing paren */
				while (i < str.length && str[i] !== ")") {
					if (str[i] === "\\") i++;
					i++;
				}
			}
			/* skip closing paren */
			continue;
		}
		if (ch === "{") depth++;
		else if (ch === "}") {
			depth--;
			if (depth === 0) return i;
		}
	}
	return str.length - 1;
}

function minifyCSS(css: string): string {
	if (css.length === 0) return css;

	let result = "";
	let i = 0;
	/*
	 * Paren depth tracks whether we are inside a functional context like
	 * `@media (min-width: 768px)` or `calc(...)`. Colons inside parens must
	 * NOT be treated as declaration separators — their surrounding spaces are
	 * significant for at-rule conditions.
	 */
	let parenDepth = 0;

	while (i < css.length) {
		/* skip block comments */
		if (css[i] === "/" && i + 1 < css.length && css[i + 1] === "*") {
			i += 2;
			while (i < css.length - 1 && !(css[i] === "*" && css[i + 1] === "/")) i++;
			i += 2;
			continue;
		}

		/* preserve quoted strings */
		if (css[i] === '"' || css[i] === "'") {
			const q = css[i];
			result += q;
			i++;
			while (i < css.length && css[i] !== q) {
				if (css[i] === "\\") {
					result += css[i];
					i++;
				}
				if (i < css.length) {
					result += css[i];
					i++;
				}
			}
			if (i < css.length) {
				result += css[i];
				i++;
			}
			continue;
		}

		/* preserve url() content */
		if (css[i] === "u" && css.slice(i, i + 4) === "url(") {
			result += "url(";
			i += 4;
			parenDepth++;
			/* skip whitespace after url( */
			while (i < css.length && (css[i] === " " || css[i] === "\t" || css[i] === "\n")) i++;
			if (i < css.length && (css[i] === '"' || css[i] === "'")) {
				/* quoted url — handled by string preservation above on next iteration */
			} else {
				/* unquoted url */
				while (i < css.length && css[i] !== ")") {
					result += css[i];
					i++;
				}
			}
			continue;
		}

		/* track paren depth */
		if (css[i] === "(") {
			parenDepth++;
			result += "(";
			i++;
			continue;
		}
		if (css[i] === ")") {
			if (parenDepth > 0) parenDepth--;
			result += ")";
			i++;
			continue;
		}

		/* collapse whitespace */
		if (css[i] === " " || css[i] === "\t" || css[i] === "\n" || css[i] === "\r") {
			i++;
			while (i < css.length && (css[i] === " " || css[i] === "\t" || css[i] === "\n" || css[i] === "\r")) i++;
			/* inside parens: keep one space (at-rule conditions, calc, etc.) */
			if (parenDepth > 0) {
				result += " ";
				continue;
			}
			/* outside parens: skip space around : ; { } , */
			const prev = result.length > 0 ? result[result.length - 1] : "";
			const next = i < css.length ? css[i] : "";
			if (
				prev === ":" ||
				prev === ";" ||
				prev === "{" ||
				prev === "}" ||
				prev === "," ||
				next === ":" ||
				next === ";" ||
				next === "{" ||
				next === "}" ||
				next === ","
			) {
				continue;
			}
			result += " ";
			continue;
		}

		result += css[i];
		i++;
	}

	/* remove trailing semicolons before } */
	result = result.replace(/;}/g, "}");

	return result;
}

function findUnquotedChar(str: string, char: string, from = 0): number {
	for (let i = from; i < str.length; i++) {
		const c = str[i];
		if (c === '"' || c === "'") {
			const q = c;
			i++;
			while (i < str.length && str[i] !== q) {
				if (str[i] === "\\") i++;
				i++;
			}
			continue;
		}
		if (c === "/" && i + 1 < str.length && str[i + 1] === "*") {
			i += 2;
			while (i < str.length - 1 && !(str[i] === "*" && str[i + 1] === "/")) i++;
			i++;
			continue;
		}
		if (c === "u" && str.slice(i, i + 4) === "url(") {
			i += 4;
			if (i < str.length && (str[i] === '"' || str[i] === "'")) {
				const q = str[i];
				i++;
				while (i < str.length && str[i] !== q) {
					if (str[i] === "\\") i++;
					i++;
				}
				if (i < str.length) i++;
			} else {
				while (i < str.length && str[i] !== ")") {
					if (str[i] === "\\") i++;
					i++;
				}
			}
			continue;
		}
		if (c === char) return i;
	}
	return -1;
}

function createStateSelectors<S extends Record<string, unknown>>(_state: S): StateSelectors<S> {
	return new Proxy({} as StateSelectors<S>, {
		get(_target, prop: string) {
			return (value: unknown) => `&[data-${prop}="${escapeCSSAttrValue(String(value))}"]`;
		},
	});
}

function createVarAccessors<V extends Record<string, unknown>>(
	vars: V,
): { accessors: VarAccessors<V>; styleMap: CSSProperties } {
	const keys = Object.keys(vars).sort();
	const styleMap: CSSProperties = {};
	const indexMap = new Map<string, number>();

	for (let i = 0; i < keys.length; i++) {
		indexMap.set(keys[i], i);
		styleMap[`--_${i}`] = String(vars[keys[i]]);
	}

	const accessors = new Proxy({} as VarAccessors<V>, {
		get(_target, prop: string) {
			const idx = indexMap.get(prop);
			if (idx !== undefined) return `var(--_${idx})`;
			throw new Error(`styles(): unknown var key "${prop}". Available keys: ${keys.join(", ")}`);
		},
	});

	return { accessors, styleMap };
}

export function styles<
	S extends Record<string, unknown> = Record<string, never>,
	V extends Record<string, unknown> = Record<string, never>,
>(name: string, config: StylesConfig<S, V>): StylesResult {
	if (typeof config === "string") {
		registerCSSByName(name, config);
		return { "data-c": name };
	}

	let effectiveName = name;
	if (config.outerCss) {
		effectiveName = `${name}-${hashString(config.outerCss)}`;
	}

	const result: StylesResult = { "data-c": effectiveName };

	/* state → data-* attributes */
	if (config.state) {
		for (const [key, value] of Object.entries(config.state)) {
			result[`data-${key}` as `data-${string}`] = String(value);
		}
	}

	/* vars → inline style + accessors */
	let varAccessors: VarAccessors<V> = {} as VarAccessors<V>;
	let varStyles: CSSProperties = {};
	if (config.vars) {
		const va = createVarAccessors(config.vars);
		varAccessors = va.accessors;
		varStyles = va.styleMap;
	}

	/* merge style */
	if (config.style || Object.keys(varStyles).length > 0) {
		result.style = { ...varStyles, ...config.style };
	}

	/* build CSS */
	const stateSelectors = config.state ? createStateSelectors(config.state) : ({} as StateSelectors<S>);
	let cssText = "";

	if (config.tw) {
		cssText += config.tw;
	}

	if (config.css) {
		const cssPart = typeof config.css === "function" ? config.css(stateSelectors, varAccessors) : config.css;
		if (cssText.length > 0) {
			cssText += `\n${cssPart}`;
		} else {
			cssText = cssPart;
		}
	}

	if (config.outerCss) {
		cssText += `\n${config.outerCss}`;
	}

	if (cssText.length > 0) {
		registerCSSByName(effectiveName, cssText);
	}

	return result;
}

export function registerCSS(css: string): string {
	const hash = hashString(css.trim());
	registerCSSByName(hash, css);
	return hash;
}

export function registerCSSByName(name: string, css: string): string {
	if (registry.has(name)) return name;
	if (isDev) validateCSS(name, css);
	const scoped = minifyCSS(scopeCSS(name, css));
	registry.set(name, scoped);
	injectStyleToDOM(scoped);
	/* FIFO eviction: remove oldest entries when over limit */
	if (registry.size > maxRegistrySize) {
		const iter = registry.keys();
		while (registry.size > maxRegistrySize) {
			const oldest = iter.next();
			if (oldest.done) break;
			registry.delete(oldest.value);
		}
		rebuildSheet();
	}
	return name;
}

/**
 * HMR-only: forcibly update an existing registry entry.
 * Deletes the old scoped CSS, re-scopes, re-injects.
 * Never call in production — guarded at call site by import.meta.hot.
 */
export function forceRegisterCSSByName(name: string, css: string): void {
	registry.delete(name);
	registerCSSByName(name, css);
}

/**
 * Split minified CSS into individual rules by tracking brace depth.
 * Handles nested @media / @supports blocks correctly.
 */
function splitCSSRules(css: string): string[] {
	const rules: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < css.length; i++) {
		if (css[i] === "{") depth++;
		else if (css[i] === "}") {
			depth--;
			if (depth === 0) {
				const rule = css.slice(start, i + 1).trim();
				if (rule.length > 0) rules.push(rule);
				start = i + 1;
			}
		}
	}
	return rules;
}

function getStyleEl(): HTMLStyleElement {
	let styleEl = document.getElementById(RUNTIME_SHEET_ID) as HTMLStyleElement | null;
	if (!styleEl) {
		styleEl = document.createElement("style");
		styleEl.id = RUNTIME_SHEET_ID;
		document.head.appendChild(styleEl);
	}
	return styleEl;
}

/**
 * Inject scoped CSS into the DOM via CSSOM insertRule (CSP-safe).
 * Falls back to textContent append for environments without CSSOM (jsdom).
 */
function injectStyleToDOM(scoped: string): void {
	if (!domInjectionEnabled || ssrSheetPresent || typeof document === "undefined") return;
	const styleEl = getStyleEl();
	const sheet = styleEl.sheet;
	if (sheet) {
		for (const rule of splitCSSRules(scoped)) {
			try {
				sheet.insertRule(rule, sheet.cssRules.length);
			} catch {
				/* Invalid rule — dev validator catches these separately */
			}
		}
	} else {
		styleEl.appendChild(document.createTextNode(scoped));
	}
}

/**
 * Rebuild the sheet from current registry after eviction.
 */
function rebuildSheet(): void {
	if (!domInjectionEnabled || typeof document === "undefined") return;
	const styleEl = getStyleEl();
	const sheet = styleEl.sheet;
	if (sheet) {
		while (sheet.cssRules.length > 0) sheet.deleteRule(0);
		for (const scoped of registry.values()) {
			for (const rule of splitCSSRules(scoped)) {
				try {
					sheet.insertRule(rule, sheet.cssRules.length);
				} catch {}
			}
		}
	} else {
		styleEl.textContent = Array.from(registry.values()).join("");
	}
}

export function getScopedStyles(): string {
	return Array.from(registry.values()).join("") + Array.from(classRegistry.values()).join("");
}

const classRegistry = new Map<string, string>();

function wrapInLayer(css: string, layer: "user.lib" | "user.app"): string {
	return `@layer ${layer}{${css}}`;
}

/** Scope raw CSS text under a class selector (`.cls`) instead of an attribute selector. */
function scopeCssToClass(className: string, css: string): string {
	/* scopeCSS uses `[data-c="<name>"]` as the scope selector.
	 * We pass a sentinel name, then replace every occurrence with `.cls`. */
	const sentinel = `__flare_scope_sentinel_${className}__`;
	const scoped = scopeCSS(sentinel, css);
	/* Replace `[data-c="<sentinel>"]` with `.cls` */
	const attrSel = `[data-c="${escapeCSSAttrValue(sentinel)}"]`;
	return scoped.split(attrSel).join(`.${className}`);
}

/**
 * Register class-scoped CSS (from compileSx / compileCss).
 * Mirrors registerCSSByName but keys by class name and uses class selectors.
 */
export function registerCSSAsClass(className: string, scopedCssInLayer: string): string {
	if (classRegistry.has(className)) return className;
	classRegistry.set(className, scopedCssInLayer);
	injectStyleToDOM(scopedCssInLayer);
	/* FIFO eviction mirrors main registry */
	if (classRegistry.size > maxRegistrySize) {
		const iter = classRegistry.keys();
		while (classRegistry.size > maxRegistrySize) {
			const oldest = iter.next();
			if (oldest.done) break;
			classRegistry.delete(oldest.value);
		}
	}
	return className;
}

/** Serialize an Sx object to stable CSS text (keys sorted at every level). */
function serializeSx(sx: Sx): string {
	const parts: string[] = [];
	const sorted = Object.keys(sx).sort();
	for (const key of sorted) {
		if (key === "variants") continue;
		const val = (sx as Record<string, unknown>)[key];
		if (val !== null && typeof val === "object" && !Array.isArray(val)) {
			parts.push(`${key}{${serializeSx(val as Sx)}}`);
		} else {
			parts.push(`${key}:${String(val)};`);
		}
	}
	/* variants block */
	const variants = sx.variants;
	if (variants) {
		for (const varName of Object.keys(variants).sort()) {
			const values = variants[varName];
			for (const varVal of Object.keys(values).sort()) {
				parts.push(`variants.${varName}.${varVal}{${serializeSx(values[varVal])}}`);
			}
		}
	}
	return parts.join("");
}

/**
 * Runtime fallback for unresolvable-static sx objects.
 * Returns a stable class name and optional inline style for dynamic vars.
 */
export function compileSx(
	obj: Sx,
	layer: "user.lib" | "user.app" = "user.app",
): { class: string; style?: Record<string, string> } {
	const serialized = serializeSx(obj);
	const hash = hashString(serialized);
	const cls = `${RT_CLASS_PREFIX}${hash}`;

	if (classRegistry.has(cls)) return { class: cls };

	const cssLines: string[] = [];
	buildSxCSS(obj, `.${cls}`, cssLines);
	const minified = minifyCSS(cssLines.join(" "));
	const layered = wrapInLayer(minified, layer);

	registerCSSAsClass(cls, layered);
	return { class: cls };
}

function camelToKebab(prop: string): string {
	return prop.replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`);
}

function buildSxCSS(sx: Sx, scopeSelector: string, out: string[]): void {
	const declarations: string[] = [];
	const raw = sx as Record<string, unknown>;

	for (const key of Object.keys(raw).sort()) {
		if (key === "variants") continue;
		const val = raw[key];

		if (key.startsWith("&")) {
			if (val !== null && typeof val === "object" && !Array.isArray(val)) {
				buildSxCSS(val as Sx, key.replace(/&/g, scopeSelector), out);
			}
		} else if (key.startsWith("@")) {
			if (val !== null && typeof val === "object" && !Array.isArray(val)) {
				const inner: string[] = [];
				buildSxCSS(val as Sx, scopeSelector, inner);
				out.push(`${key}{${inner.join(" ")}}`);
			}
		} else {
			declarations.push(`${camelToKebab(key)}:${String(val)};`);
		}
	}

	if (declarations.length > 0) {
		out.push(`${scopeSelector}{${declarations.join("")}}`);
	}

	const variants = sx.variants;
	if (variants) {
		for (const varName of Object.keys(variants).sort()) {
			const values = variants[varName];
			for (const varVal of Object.keys(values).sort()) {
				buildSxCSS(values[varVal], `${scopeSelector}[data-${varName}="${varVal}"]`, out);
			}
		}
	}
}

/**
 * Register raw CSS text under a stable content-hashed class name.
 * Serves the `css="..."` prop and manual CMS calls.
 */
export function compileCss(text: string, layer: "user.lib" | "user.app" = "user.app"): string {
	const trimmed = text.trim();
	const hash = hashString(trimmed);
	const cls = `${RT_CLASS_PREFIX}${hash}`;

	if (classRegistry.has(cls)) return cls;

	const scoped = scopeCssToClass(cls, trimmed);
	const minified = minifyCSS(scoped);
	const layered = wrapInLayer(minified, layer);

	registerCSSAsClass(cls, layered);
	return cls;
}

/** Accepted input shapes for `cn()`. Superset of the JSX `ClassValue` — adds object maps. */
export type CnValue = string | false | null | undefined | Record<string, boolean> | CnValue[];

function collectClasses(input: CnValue, seen: Set<string>, out: string[]): void {
	if (!input) return;
	if (typeof input === "string") {
		/* Split on whitespace — each token deduped individually */
		for (const token of input.trim().split(/\s+/)) {
			if (token && !seen.has(token)) {
				seen.add(token);
				out.push(token);
			}
		}
		return;
	}
	if (Array.isArray(input)) {
		for (const item of input) collectClasses(item as CnValue, seen, out);
		return;
	}
	if (typeof input === "object") {
		for (const [key, active] of Object.entries(input)) {
			if (active && !seen.has(key)) {
				seen.add(key);
				out.push(key);
			}
		}
	}
}

/** Merge class names, filter falsy, deduplicate. Matches clsx API. */
export function cn(...inputs: CnValue[]): string {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const input of inputs) collectClasses(input, seen, out);
	return out.join(" ");
}

export function clearScopedStyles(): void {
	registry.clear();
	classRegistry.clear();
	domInjectionEnabled = false;
	ssrSheetPresent = false;
	if (typeof document !== "undefined") {
		const styleEl = document.getElementById(RUNTIME_SHEET_ID) as HTMLStyleElement | null;
		if (styleEl) {
			styleEl.textContent = "";
			const sheet = styleEl.sheet;
			if (sheet) {
				while (sheet.cssRules.length > 0) sheet.deleteRule(0);
			}
		}
	}
}
