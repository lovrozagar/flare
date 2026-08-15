import MagicString from "magic-string";
import type { Expression, JSXAttribute, JSXOpeningElement, Node, ObjectExpression, Program } from "oxc-parser";
import { parseSource } from "./parser.ts";
import { evaluateSxObject } from "./evaluator.ts";
import { emitAtomic } from "./atomic.ts";

export interface RewriteCtx {
	sourcePath: string;
	layer: "sx" | "app";
	mode: "dev" | "prod";
	cssEmit: (rule: string) => void;
	/**
	 * Per-token Tailwind compile fn. Returns CSS body text for known utilities,
	 * null for unknown tokens. Omit to disable Tailwind compilation entirely.
	 */
	twCompile?: (token: string) => string | null;
}

export interface RewriteResult {
	code: string;
	map: null;
	emittedClasses: Set<string>;
}

/* Layer arg embedded at transform time based on enclosing module's layer. */
function layerArg(layer: "sx" | "app"): string {
	return layer === "sx" ? '"user.lib"' : '"user.app"';
}

type FlareImport = "compileSx" | "compileCss" | "cn";

function srcOf(source: string, node: { start: number; end: number }): string {
	return source.slice(node.start, node.end);
}

function isObjectExpression(n: unknown): n is ObjectExpression {
	return typeof n === "object" && n !== null && (n as { type: string }).type === "ObjectExpression";
}

function isStringLiteral(n: unknown): n is { type: "Literal"; value: string; start: number; end: number } {
	return (
		typeof n === "object" &&
		n !== null &&
		(n as { type: string }).type === "Literal" &&
		typeof (n as { value: unknown }).value === "string"
	);
}

function isJSXExpressionContainer(
	n: unknown,
): n is { type: "JSXExpressionContainer"; expression: Expression; start: number; end: number } {
	return typeof n === "object" && n !== null && (n as { type: string }).type === "JSXExpressionContainer";
}

function isCallExpression(n: unknown): n is {
	type: "CallExpression";
	callee: { type: string; name?: string };
	arguments: Expression[];
	start: number;
	end: number;
} {
	return typeof n === "object" && n !== null && (n as { type: string }).type === "CallExpression";
}

function isArrayExpression(
	n: unknown,
): n is { type: "ArrayExpression"; elements: Array<Expression | null>; start: number; end: number } {
	return typeof n === "object" && n !== null && (n as { type: string }).type === "ArrayExpression";
}

function isIdentifier(n: unknown): n is { type: "Identifier"; name: string; start: number; end: number } {
	return typeof n === "object" && n !== null && (n as { type: string }).type === "Identifier";
}

function tagName(opening: JSXOpeningElement): string {
	const name = opening.name as { type: string; name?: string };
	if (name.type === "JSXIdentifier" && typeof name.name === "string") return name.name;
	return "Component";
}

function isDOMElement(tag: string): boolean {
	return tag.length > 0 && tag[0] !== "" && tag[0] === tag[0].toLowerCase();
}

function isCnCall(expr: Expression): boolean {
	if (!isCallExpression(expr)) return false;
	return expr.callee.type === "Identifier" && expr.callee.name === "cn";
}

function isTemplateLiteral(n: unknown): n is {
	type: "TemplateLiteral";
	quasis: Array<{ type: "TemplateElement"; value: { cooked: string | null }; tail: boolean }>;
	expressions: Expression[];
} {
	return typeof n === "object" && n !== null && (n as { type: string }).type === "TemplateLiteral";
}

/* Matches group/peer marker tokens — must remain as literal class names on the DOM element. */
const MARKER_TOKEN_RE = /^(?:group|peer)(?:\/[\w-]+)?$/;

function cssEscapeClass(cls: string): string {
	return cls.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}

/**
 * Walk an expression and collect every string literal that appears as a class token.
 * Handles: plain string literals, array elements (recursive), LogicalExpression right-arms,
 * ternary branches, cn() arguments, TemplateLiteral quasis and string-literal expressions.
 */
function collectClassLiterals(expr: unknown): string[] {
	if (isStringLiteral(expr)) return [expr.value];

	if (isTemplateLiteral(expr)) {
		const tokens: string[] = [];
		/* Static quasis */
		for (const quasi of expr.quasis) {
			const cooked = quasi.value.cooked ?? "";
			for (const tok of cooked.split(/\s+/).filter(Boolean)) tokens.push(tok);
		}
		/* String-literal expressions inside template */
		for (const e of expr.expressions) {
			tokens.push(...collectClassLiterals(e));
		}
		return tokens;
	}

	if (isArrayExpression(expr)) {
		const tokens: string[] = [];
		for (const el of expr.elements) {
			if (el === null) continue;
			tokens.push(...collectClassLiterals(el));
		}
		return tokens;
	}

	if (isCallExpression(expr)) {
		/* Scan inside cn(...) and any other call's arguments */
		const tokens: string[] = [];
		for (const arg of expr.arguments) {
			tokens.push(...collectClassLiterals(arg));
		}
		return tokens;
	}

	const node = expr as {
		type?: string;
		left?: unknown;
		right?: unknown;
		consequent?: unknown;
		alternate?: unknown;
	} | null;
	if (!node || typeof node.type !== "string") return [];

	if (node.type === "LogicalExpression") {
		/* Only scan the right arm — left arm is never a class string */
		return collectClassLiterals(node.right);
	}

	if (node.type === "ConditionalExpression") {
		return [...collectClassLiterals(node.consequent), ...collectClassLiterals(node.alternate)];
	}

	return [];
}

/**
 * Scan all string literals in a class attribute value expression,
 * compile recognized Tailwind utility tokens, and emit CSS rules via ctx.cssEmit.
 * Marker tokens (group, peer) are skipped — they must remain as literal class names.
 */
function compileTwFromExpr(expr: unknown, ctx: RewriteCtx): void {
	if (!ctx.twCompile) return;
	const tokens = collectClassLiterals(expr);
	for (const raw of tokens) {
		/* Each raw value may be a space-separated multi-token string */
		for (const token of raw.split(/\s+/).filter(Boolean)) {
			if (MARKER_TOKEN_RE.test(token)) continue;
			const body = ctx.twCompile(token);
			if (!body) continue;
			ctx.cssEmit(buildTwRule(token, body));
		}
	}
}

/**
 * Compile Tailwind tokens from a plain string value (e.g. class="bg-blue-500 p-4").
 */
function compileTwFromString(value: string, ctx: RewriteCtx): void {
	if (!ctx.twCompile) return;
	for (const token of value.split(/\s+/).filter(Boolean)) {
		if (MARKER_TOKEN_RE.test(token)) continue;
		const body = ctx.twCompile(token);
		if (!body) continue;
		ctx.cssEmit(buildTwRule(token, body));
	}
}

/**
 * Build a CSS rule string from a Tailwind token and the body returned by the compiler.
 *
 * Three body shapes from the compiler:
 *   - plain declarations: `"background-color: red"` → `.token { decls }`
 *   - pseudo variant:     `"&:hover { decls }"` → `.token:hover { decls }` (& replaced)
 *   - at-rule variant:    `"@media (...) { decls }"` → `@media (...) { .token { decls } }`
 */
function buildTwRule(token: string, body: string): string {
	const escaped = cssEscapeClass(token);
	const trimmed = body.trimStart();
	if (trimmed.startsWith("&")) {
		/* Replace & with the class selector */
		return body.replace(/&/g, `.${escaped}`);
	}
	if (trimmed.startsWith("@")) {
		/* At-rule: inject .selector { decls } inside the at-block */
		const braceIdx = trimmed.indexOf("{");
		if (braceIdx !== -1) {
			const atPart = trimmed.slice(0, braceIdx).trim();
			/* Extract content between outermost braces */
			let depth = 0;
			let innerStart = -1;
			let innerEnd = -1;
			for (let i = braceIdx; i < trimmed.length; i++) {
				if (trimmed[i] === "{") {
					if (depth++ === 0) innerStart = i + 1;
				} else if (trimmed[i] === "}") {
					if (--depth === 0) {
						innerEnd = i;
						break;
					}
				}
			}
			const inner = innerStart !== -1 && innerEnd !== -1 ? trimmed.slice(innerStart, innerEnd).trim() : "";
			return `${atPart} { .${escaped} { ${inner} } }`;
		}
	}
	return `.${escaped} { ${body} }`;
}

function allStaticStrings(elements: Array<Expression | null>): string[] | null {
	const result: string[] = [];
	for (const el of elements) {
		if (el === null) continue;
		if (!isStringLiteral(el)) return null;
		result.push(el.value);
	}
	return result;
}

/*
 * Resolve a mixed-type class array to either a literal string or a template expr string.
 * LogicalExpression `cond && "str"` → ternary guard in template.
 */
function resolveClassArray(
	source: string,
	elements: Array<Expression | null>,
): { kind: "literal"; value: string } | { kind: "template"; expr: string } {
	const allStatic = allStaticStrings(elements);
	if (allStatic !== null) {
		return { kind: "literal", value: allStatic.filter(Boolean).join(" ") };
	}

	const parts: string[] = [];
	let first = true;
	for (const el of elements) {
		if (el === null) continue;
		if (isStringLiteral(el)) {
			parts.push(first ? el.value : ` ${el.value}`);
			first = false;
		} else if (
			typeof el === "object" &&
			el !== null &&
			(el as { type: string }).type === "LogicalExpression" &&
			(el as { operator?: string }).operator === "&&"
		) {
			const logic = el as { left: Expression; right: Expression };
			const leftSrc = srcOf(source, logic.left as { start: number; end: number });
			const rightEl = logic.right;
			if (isStringLiteral(rightEl)) {
				const sep = first ? "" : " ";
				parts.push(`\${${leftSrc} ? "${sep}${rightEl.value}" : ""}`);
			} else {
				const sep = first ? "" : " ";
				const rightSrc = srcOf(source, rightEl as { start: number; end: number });
				parts.push(`\${${leftSrc} ? \`${sep}\${${rightSrc}}\` : ""}`);
			}
			first = false;
		} else {
			/* Skip null/false literals and the `undefined` identifier — they contribute nothing. */
			const isNullLit = (el as { type: string }).type === "Literal" && (el as { value: unknown }).value === null;
			const isFalseLit = (el as { type: string }).type === "Literal" && (el as { value: unknown }).value === false;
			const isUndefined = isIdentifier(el) && el.name === "undefined";
			if (isNullLit || isFalseLit || isUndefined) continue;
			const sep = first ? "" : " ";
			parts.push(`${sep}\${${srcOf(source, el as { start: number; end: number })}}`);
			first = false;
		}
	}

	return { expr: parts.join(""), kind: "template" };
}

function findAttr(opening: JSXOpeningElement, name: string): JSXAttribute | null {
	for (const attr of opening.attributes) {
		if (attr.type !== "JSXAttribute") continue;
		const attrName = (attr as JSXAttribute).name;
		if (attrName.type === "JSXIdentifier" && attrName.name === name) {
			return attr as JSXAttribute;
		}
	}
	return null;
}

function hasSpread(opening: JSXOpeningElement): { identName: string } | null {
	for (const attr of opening.attributes) {
		if (attr.type === "JSXSpreadAttribute") {
			const arg = (attr as unknown as { argument: Expression }).argument;
			if (isIdentifier(arg)) return { identName: arg.name };
		}
	}
	return null;
}

/*
 * Resolve an existing class= attribute value to a canonical form.
 * Returns either a literal string (for `class="..."`) or an expression string (for `class={expr}`).
 */
function resolveClassAttr(
	source: string,
	classAttr: JSXAttribute,
): { kind: "literal"; value: string } | { kind: "expr"; expr: string; wasArray: boolean; wasDynamic: boolean } {
	const cv = classAttr.value;
	if (cv === null) return { kind: "literal", value: "" };

	if (isStringLiteral(cv)) return { kind: "literal", value: cv.value };

	if (isJSXExpressionContainer(cv)) {
		const expr = cv.expression;
		if (isStringLiteral(expr)) return { kind: "literal", value: expr.value };
		if (isArrayExpression(expr)) {
			const resolved = resolveClassArray(source, expr.elements);
			if (resolved.kind === "literal") return { kind: "literal", value: resolved.value };
			return { expr: `\`${resolved.expr}\``, kind: "expr", wasArray: true, wasDynamic: false };
		}
		if (isCnCall(expr)) {
			/* Explicit cn() — preserve as-is */
			return {
				expr: srcOf(source, expr as { start: number; end: number }),
				kind: "expr",
				wasArray: false,
				wasDynamic: false,
			};
		}
		/* Dynamic expression → wrap in cn() */
		return {
			expr: `cn(${srcOf(source, expr as { start: number; end: number })})`,
			kind: "expr",
			wasArray: false,
			wasDynamic: true,
		};
	}
	/* c8 ignore next 2 -- JSX attr values are always null | Literal | JSXExpressionContainer */
	return { kind: "literal", value: "" };
}

export function rewriteModule(source: string, ctx: RewriteCtx): RewriteResult | null {
	if (!source.includes("sx=") && !source.includes("css=") && !source.includes("class=")) {
		return null;
	}

	const { program } = parseSource(source, ctx.sourcePath);
	const ms = new MagicString(source);

	/*
	 * Collect replacements as { start, end, text } tuples.
	 * Zero-length (start === end) = insertion; use prependLeft/appendLeft, not update().
	 * Applied in reverse offset order to preserve positions.
	 */
	const replacements: Array<{ start: number; end: number; text: string }> = [];
	const insertsBefore: Array<{ pos: number; text: string }> = [];

	const neededImports = new Set<FlareImport>();
	const emittedClasses = new Set<string>();
	let changed = false;

	function replace(start: number, end: number, text: string): void {
		replacements.push({ end, start, text });
		changed = true;
	}

	function insertBefore(pos: number, text: string): void {
		insertsBefore.push({ pos, text });
		changed = true;
	}

	function walkNode(node: unknown): void {
		/* istanbul ignore next -- oxc-parser AST never has null/primitive children at top-level */
		if (typeof node !== "object" || node === null) return;
		const n = node as Record<string, unknown>;
		if (n["type"] === "JSXOpeningElement") {
			handleOpeningElement(node as JSXOpeningElement);
		}
		for (const key of Object.keys(n)) {
			/* istanbul ignore next -- oxc-parser AST nodes don't have a `parent` back-reference */
			if (key === "parent") continue;
			const val = n[key];
			if (Array.isArray(val)) {
				for (const child of val) walkNode(child);
			} else if (val !== null && typeof val === "object") {
				walkNode(val);
			}
		}
	}

	function emitClassAttr(
		classAttr: JSXAttribute | null,
		insertPos: number,
		literal: string | null,
		expr: string | null,
	): void {
		let attrText: string;
		if (literal !== null) {
			attrText = `class="${literal}"`;
		} else {
			/* istanbul ignore next -- expr is always non-null when literal is null at all call sites */
			attrText = `class={${expr ?? '""'}}`;
		}

		if (classAttr) {
			replace(classAttr.start, classAttr.end, attrText);
		} else {
			insertBefore(insertPos, `${attrText} `);
		}
	}

	function handleOpeningElement(opening: JSXOpeningElement): void {
		const tag = tagName(opening);
		const dom = isDOMElement(tag);

		const sxAttr = findAttr(opening, "sx");
		const classAttr = findAttr(opening, "class");
		const cssAttr = findAttr(opening, "css");
		const spread = dom ? hasSpread(opening) : null;

		/* Resolve existing class= to a canonical form */
		let classLiteral: string | null = null;
		let classExpr: string | null = null;
		let classWasArray = false;
		let classWasDynamic = false;
		let classNeedsRewrite = false;

		if (classAttr) {
			const resolved = resolveClassAttr(source, classAttr);
			if (resolved.kind === "literal") {
				classLiteral = resolved.value;
			} else {
				classExpr = resolved.expr;
				classWasArray = resolved.wasArray;
				classWasDynamic = resolved.wasDynamic;
				if (classWasDynamic) neededImports.add("cn");
			}

			/* Compile Tailwind utilities found in class= string literals */
			const cv = classAttr.value;
			if (cv === null) {
				/* boolean attr — nothing to compile */
			} else if (isStringLiteral(cv)) {
				compileTwFromString(cv.value, ctx);
			} else if (isJSXExpressionContainer(cv)) {
				const expr = cv.expression;
				if (isStringLiteral(expr)) {
					compileTwFromString(expr.value, ctx);
				} else {
					compileTwFromExpr(expr, ctx);
				}
			}
		}

		/* Spread + existing class on a DOM element → merge */
		if (spread && classAttr && dom) {
			const spreadClass = `${spread.identName}.class`;
			if (classLiteral !== null) {
				classExpr = `\`${classLiteral} \${${spreadClass} ?? ""}\``;
				classLiteral = null;
			} /* c8 ignore next 4 -- classExpr always non-null here: spread+classAttr converts literal→expr above */ else if (
				classExpr !== null
			) {
				classExpr = `cn(${classExpr}, ${spreadClass})`;
				neededImports.add("cn");
			}
			classNeedsRewrite = true;
		}

		/* Handle sx= */
		if (sxAttr) {
			const sxVal = sxAttr.value;
			let sxIsDynamic = false;

			if (sxVal !== null && isJSXExpressionContainer(sxAttr.value as unknown)) {
				const container = sxVal as unknown as { expression: Expression };
				const expr = container.expression;
				if (isObjectExpression(expr)) {
					const evalResult = evaluateSxObject(expr);
					if (evalResult.ir !== null) {
						const atomic = emitAtomic(evalResult.ir, ctx.mode);
						for (const cls of atomic.classes) emittedClasses.add(cls);
						for (const [cls, rule] of atomic.cssRules) {
							emittedClasses.add(cls);
							ctx.cssEmit(rule);
						}

						const atomicStr = atomic.classes.join(" ");

						/* Remove sx= attr */
						replace(sxAttr.start, sxAttr.end, "");

						/* Emit style vars for dynamic CSS custom properties */
						if (atomic.vars.length > 0) {
							const styleEntries = atomic.vars
								.map((v) => `"--_${v.index}": ${srcOf(source, v.exprNode as { start: number; end: number })}`)
								.join(", ");
							/* Insert style prop at element opening position (before first attr or tag end) */
							/* istanbul ignore next -- sx itself is always an attribute, so length > 0 always */
							const insertAt =
								opening.attributes.length > 0
									? opening.attributes[0].start
									: opening.end - (opening.selfClosing ? 2 : 1);
							insertBefore(insertAt, `style={{ ${styleEntries} }} `);
						}

						/* Merge atomics into class */
						if (spread && dom) {
							const spreadClass = `${spread.identName}.class`;
							/* istanbul ignore next -- classLiteral is always null here: spread+classAttr converts it to classExpr at line 284 */
							if (classLiteral !== null) {
								const combined = [classLiteral, atomicStr].filter(Boolean).join(" ");
								classExpr = `\`${combined} \${${spreadClass} ?? ""}\``;
								classLiteral = null;
							} else if (classExpr !== null) {
								classExpr = `cn(${classExpr}, "${atomicStr}", ${spreadClass})`;
								neededImports.add("cn");
							} else {
								classExpr = `\`${atomicStr} \${${spreadClass} ?? ""}\``;
							}
						} else {
							if (classLiteral !== null) {
								classLiteral = [classLiteral, atomicStr].filter(Boolean).join(" ");
							} else if (classExpr !== null) {
								classExpr = `cn(${classExpr}, "${atomicStr}")`;
								neededImports.add("cn");
							} else {
								classLiteral = atomicStr;
							}
						}

						emitClassAttr(classAttr, sxAttr.start, classLiteral, classExpr);

						/* Continue — css= on same element must also be processed */
						if (cssAttr) {
							handleCssAttr(cssAttr, classAttr, {
								expr: classExpr,
								insertPos: sxAttr.start,
								literal: classLiteral,
							});
						}
						return;
					}
					sxIsDynamic = true;
				} else {
					sxIsDynamic = true;
				}
			} else {
				sxIsDynamic = true;
			}

			/* istanbul ignore else -- static path returns early above; reaching here means sxIsDynamic is always true */
			if (sxIsDynamic) {
				const container = sxVal as unknown as { expression: Expression } | null;
				if (container && isJSXExpressionContainer(sxAttr.value as unknown)) {
					const exprSrc = srcOf(source, container.expression as { start: number; end: number });
					const layer = layerArg(ctx.layer);
					replace(sxAttr.start, sxAttr.end, `{...compileSx(${exprSrc}, ${layer})}`);
					neededImports.add("compileSx");
				}
				/* For dynamic sx, also handle class merge if needed */
				if (classNeedsRewrite && classAttr) {
					emitClassAttr(classAttr, sxAttr.start, classLiteral, classExpr);
				}
			}
			/* css= on same element must be processed even when sx is dynamic */
			if (cssAttr) {
				handleCssAttr(cssAttr, classAttr);
			}
			return;
		}

		/* Also rewrite when classAttr had an array expression that resolved to a literal (flatten it) */
		const classAttrWasArray = classAttr
			? (() => {
					const cv = classAttr.value;
					if (!cv || !isJSXExpressionContainer(cv)) return false;
					return isArrayExpression((cv as { expression: unknown }).expression);
				})()
			: false;
		if (classAttr && (classAttrWasArray || classWasArray || classWasDynamic || classNeedsRewrite)) {
			emitClassAttr(classAttr, classAttr.start, classLiteral, classExpr);
		} else if (!classAttr && spread && dom) {
			/* Spread on DOM with no class attr — don't inject anything */
		}

		/* Handle css= attr */
		if (cssAttr) {
			handleCssAttr(cssAttr, classAttr);
		}
	}

	/*
	 * precomputed: when sx= was already processed on the same element, pass the
	 * sx-merged class state so handleCssAttr doesn't re-resolve from stale source.
	 * Without it, classAttr in source still reflects the original value, not the
	 * sx-updated one — leading to a double-replace on the same span.
	 */
	function handleCssAttr(
		cssAttr: JSXAttribute,
		classAttr: JSXAttribute | null,
		precomputed?: { literal: string | null; expr: string | null; insertPos: number },
	): void {
		const layer = layerArg(ctx.layer);
		const val = cssAttr.value;

		if (val === null) return;

		let compileCssCall: string;

		if (isStringLiteral(val)) {
			compileCssCall = `compileCss(${JSON.stringify(val.value)}, ${layer})`;
		} else if (isJSXExpressionContainer(val)) {
			const expr = val.expression;
			if (isStringLiteral(expr)) {
				compileCssCall = `compileCss(${JSON.stringify(expr.value)}, ${layer})`;
			} else {
				const exprSrc = srcOf(source, expr as { start: number; end: number });
				compileCssCall = `compileCss(${exprSrc}, ${layer})`;
			}
		} /* c8 ignore next 4 -- unreachable: JSX attr values are null | Literal | JSXExpressionContainer only */ else {
			/* c8 ignore next */
			return;
		}

		neededImports.add("compileCss");

		/* Remove css= attr */
		replace(cssAttr.start, cssAttr.end, "");

		/* Fold into class= or insert new class= */
		if (precomputed) {
			/* sx already emitted a class= replacement — fold compileCss into that same output */
			const { literal, expr, insertPos } = precomputed;
			if (classAttr && literal !== null) {
				if (literal) {
					replace(classAttr.start, classAttr.end, `class={cn("${literal}", ${compileCssCall})}`);
					neededImports.add("cn");
				} else {
					replace(classAttr.start, classAttr.end, `class={${compileCssCall}}`);
				}
			} else if (classAttr && expr !== null) {
				replace(classAttr.start, classAttr.end, `class={cn(${expr}, ${compileCssCall})}`);
				neededImports.add("cn");
			} else {
				/* sx produced no class (shouldn't happen for static sx) — insert at insertPos */
				insertBefore(insertPos, `class={${compileCssCall}} `);
			}
		} else if (classAttr) {
			const existing = resolveClassAttr(source, classAttr);
			if (existing.kind === "literal") {
				if (existing.value) {
					replace(classAttr.start, classAttr.end, `class={cn("${existing.value}", ${compileCssCall})}`);
					neededImports.add("cn");
				} else {
					replace(classAttr.start, classAttr.end, `class={${compileCssCall}}`);
				}
			} else {
				replace(classAttr.start, classAttr.end, `class={cn(${existing.expr}, ${compileCssCall})}`);
				neededImports.add("cn");
			}
		} else {
			/* Insert class={compileCssCall} at css= position (which is removed) */
			insertBefore(cssAttr.start, `class={${compileCssCall}} `);
		}
	}

	walkNode(program as unknown as Node);

	if (!changed) return null;

	/* Apply replacements in reverse order (no zero-length update calls) */
	replacements.sort((a, b) => b.start - a.start);
	for (const r of replacements) {
		/* istanbul ignore next -- zero-length replacements don't arise from normal JSX attrs */
		if (r.start === r.end) {
			ms.appendLeft(r.start, r.text);
		} else {
			ms.update(r.start, r.end, r.text);
		}
	}

	/* Apply insertions */
	insertsBefore.sort((a, b) => b.pos - a.pos);
	for (const ins of insertsBefore) {
		ms.prependLeft(ins.pos, ins.text);
	}

	/* Inject missing flare/styles imports */
	if (neededImports.size > 0) {
		const prog = program as unknown as Program;
		let lastImportEnd = 0;
		let existingStylesImport: {
			start: number;
			end: number;
			specifiers: Array<{ local: { name: string }; end: number }>;
		} | null = null;

		for (const stmt of prog.body) {
			if ((stmt as { type: string }).type !== "ImportDeclaration") continue;
			lastImportEnd = Math.max(lastImportEnd, (stmt as { end: number }).end);
			const s = stmt as {
				source: { value: string };
				start: number;
				end: number;
				specifiers: Array<{ local: { name: string }; end: number }>;
			};
			if (s.source.value === "@lovrozagar/flare/styles" || s.source.value === "flare/styles") {
				existingStylesImport = s;
			}
		}

		if (existingStylesImport) {
			/* Merge needed specifiers into the existing import, skipping already-present ones */
			const presentNames = new Set(existingStylesImport.specifiers.map((sp) => sp.local.name));
			const missing = [...neededImports].filter((name) => !presentNames.has(name)).sort();
			if (missing.length > 0) {
				const toAppend = missing.map((name) => `, ${name}`).join("");
				/* Insert after the last specifier's end position (before `}`) */
				const lastSpec = existingStylesImport.specifiers.at(-1);
				if (lastSpec) {
					ms.prependLeft(lastSpec.end, toAppend);
				} else {
					/* Empty import `import {} from "..."` — insert inside braces */
					ms.prependLeft(existingStylesImport.start + "import {".length, missing.join(", "));
				}
			}
		} else {
			const specifiers = [...neededImports].sort().join(", ");
			const importLine = `import { ${specifiers} } from "@lovrozagar/flare/styles"\n`;
			if (lastImportEnd > 0) {
				ms.prependLeft(lastImportEnd, `\n${importLine}`);
			} else {
				ms.prepend(importLine);
			}
		}
	}

	return { code: ms.toString(), emittedClasses, map: null };
}
