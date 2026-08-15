import type { Expression, Node, ObjectExpression } from "oxc-parser";

export type CssValue = { kind: "static"; text: string } | { kind: "dynamic"; exprNode: Expression };

export interface SxIR {
	base: Record<string, CssValue>;
	selectors: Array<{ sel: string; body: SxIR }>;
	atRules: Array<{ at: string; body: SxIR }>;
	variants: Record<string, Record<string, SxIR>>;
}

export interface EvalDiagnostic {
	kind: "warning" | "error";
	message: string;
	node: Node;
}

export interface EvalResult {
	ir: SxIR | null;
	diagnostics: EvalDiagnostic[];
}

/*
 * React DOMProperty unitless list + csstype cross-reference.
 * Properties here get no `px` suffix when their value is a plain number.
 */
const UNITLESS = new Set([
	"animationIterationCount",
	"aspectRatio",
	"borderImageOutset",
	"borderImageSlice",
	"borderImageWidth",
	"columnCount",
	"columns",
	"flex",
	"flexGrow",
	"flexShrink",
	"fontWeight",
	"gridColumn",
	"gridColumnEnd",
	"gridColumnStart",
	"gridRow",
	"gridRowEnd",
	"gridRowStart",
	"lineClamp",
	"lineHeight",
	"opacity",
	"order",
	"orphans",
	"tabSize",
	"widows",
	"zIndex",
	"zoom",
	"fillOpacity",
	"floodOpacity",
	"stopOpacity",
	"strokeDasharray",
	"strokeDashoffset",
	"strokeMiterlimit",
	"strokeOpacity",
	"strokeWidth",
]);

function makeEmptyIR(): SxIR {
	return { atRules: [], base: {}, selectors: [], variants: {} };
}

function normNumeric(prop: string, raw: number): string {
	if (UNITLESS.has(prop)) return String(raw);
	return `${raw}px`;
}

/** Evaluate the value expression of a single CSS property. */
function evalValue(prop: string, expr: Expression): CssValue {
	if (expr.type === "Literal") {
		const lit = expr as { type: "Literal"; value: unknown };
		if (typeof lit.value === "string") return { kind: "static", text: lit.value };
		if (typeof lit.value === "number") return { kind: "static", text: normNumeric(prop, lit.value) };
		if (typeof lit.value === "boolean") return { kind: "static", text: String(lit.value) };
	}
	if (expr.type === "UnaryExpression") {
		const unary = expr as { type: "UnaryExpression"; operator: string; argument: Expression };
		if (unary.operator === "-" && unary.argument.type === "Literal") {
			const argLit = unary.argument as { value: unknown };
			if (typeof argLit.value === "number") {
				return { kind: "static", text: normNumeric(prop, -argLit.value) };
			}
		}
	}
	if (expr.type === "TemplateLiteral") {
		const tl = expr as {
			type: "TemplateLiteral";
			expressions: Expression[];
			quasis: Array<{ value: { cooked: string } }>;
		};
		if (tl.expressions.length === 0) {
			return { kind: "static", text: tl.quasis[0].value.cooked };
		}
		return { exprNode: expr, kind: "dynamic" };
	}
	/* Identifier, MemberExpression, CallExpression, etc. → dynamic */
	return { exprNode: expr, kind: "dynamic" };
}

/** Resolve a key node to a string, or null if unresolvable (computed/dynamic). */
function resolveKey(prop: { computed: boolean; key: Node }): string | null {
	if (prop.computed) return null;
	const key = prop.key as { type: string; name?: string; value?: unknown };
	if (key.type === "Identifier" && typeof key.name === "string") return key.name;
	if (key.type === "Literal" && typeof key.value === "string") return key.value;
	return null;
}

/** Merge properties from a literal ObjectExpression into an existing IR (for spread inlining). */
function mergeObjectIntoIR(objExpr: ObjectExpression, ir: SxIR, diagnostics: EvalDiagnostic[]): boolean {
	for (const propOrSpread of objExpr.properties) {
		if (propOrSpread.type === "SpreadElement") {
			const spread = propOrSpread as { type: "SpreadElement"; argument: Expression };
			/* Only inline if argument is itself an ObjectExpression */
			if (spread.argument.type === "ObjectExpression") {
				const ok = mergeObjectIntoIR(spread.argument as ObjectExpression, ir, diagnostics);
				if (!ok) return false;
			} else {
				diagnostics.push({
					kind: "error",
					message: `partially dynamic sx object: ${(spread.argument as { name?: string }).name ?? "expression"} cannot be resolved at build time`,
					node: propOrSpread as unknown as Node,
				});
				return false;
			}
			continue;
		}

		const prop = propOrSpread as {
			type: "Property";
			computed: boolean;
			key: Node;
			value: Expression;
		};

		if (prop.computed) {
			diagnostics.push({
				kind: "warning",
				message: "computed key in sx object cannot be statically resolved — skipped",
				node: prop.key,
			});
			continue;
		}

		const keyStr = resolveKey(prop);
		if (keyStr === null) {
			diagnostics.push({
				kind: "warning",
				message: "unresolvable key in sx object — skipped",
				node: prop.key,
			});
			continue;
		}

		if (keyStr === "variants") {
			/* variants: { propName: { value: SxIR } } */
			if (prop.value.type !== "ObjectExpression") continue;
			const variantsObj = prop.value as ObjectExpression;
			for (const varProp of variantsObj.properties) {
				if (varProp.type !== "Property") continue;
				const vp = varProp as { type: "Property"; computed: boolean; key: Node; value: Expression };
				const varName = resolveKey(vp);
				if (!varName) continue;
				if (vp.value.type !== "ObjectExpression") continue;
				const valuesObj = vp.value as ObjectExpression;
				ir.variants[varName] = ir.variants[varName] ?? {};
				for (const valProp of valuesObj.properties) {
					if (valProp.type !== "Property") continue;
					const vvp = valProp as { type: "Property"; computed: boolean; key: Node; value: Expression };
					const valName = resolveKey(vvp);
					if (!valName) continue;
					if (vvp.value.type !== "ObjectExpression") continue;
					const bodyIR = makeEmptyIR();
					mergeObjectIntoIR(vvp.value as ObjectExpression, bodyIR, diagnostics);
					ir.variants[varName][valName] = bodyIR;
				}
			}
			continue;
		}

		if (keyStr.startsWith("&")) {
			/* nested selector */
			if (prop.value.type !== "ObjectExpression") continue;
			const bodyIR = makeEmptyIR();
			mergeObjectIntoIR(prop.value as ObjectExpression, bodyIR, diagnostics);
			ir.selectors.push({ body: bodyIR, sel: keyStr });
			continue;
		}

		if (keyStr.startsWith("@")) {
			/* at-rule */
			if (prop.value.type !== "ObjectExpression") continue;
			const bodyIR = makeEmptyIR();
			mergeObjectIntoIR(prop.value as ObjectExpression, bodyIR, diagnostics);
			ir.atRules.push({ at: keyStr, body: bodyIR });
			continue;
		}

		/* plain CSS property */
		ir.base[keyStr] = evalValue(keyStr, prop.value);
	}
	return true;
}

/** Evaluate a JSX `sx={{...}}` ObjectExpression to an intermediate representation. */
export function evaluateSxObject(node: ObjectExpression): EvalResult {
	const diagnostics: EvalDiagnostic[] = [];
	const ir = makeEmptyIR();

	/* First pass: check for top-level spreads that are non-literal */
	for (const propOrSpread of node.properties) {
		if (propOrSpread.type === "SpreadElement") {
			const spread = propOrSpread as { type: "SpreadElement"; argument: Expression };
			if (spread.argument.type !== "ObjectExpression") {
				const name = (spread.argument as { name?: string }).name ?? "expression";
				diagnostics.push({
					kind: "error",
					message: `partially dynamic sx object: ${name} cannot be resolved at build time`,
					node: propOrSpread as unknown as Node,
				});
				return { diagnostics, ir: null };
			}
		}
	}

	const ok = mergeObjectIntoIR(node, ir, diagnostics);
	if (!ok) return { diagnostics, ir: null };

	return { diagnostics, ir };
}
