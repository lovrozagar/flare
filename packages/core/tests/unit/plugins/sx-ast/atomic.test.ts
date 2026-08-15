/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import type { Expression } from "oxc-parser";
import { emitAtomic } from "../../../../src/plugins/sx-ast/atomic.ts";
import type { SxIR } from "../../../../src/plugins/sx-ast/evaluator.ts";

function makeIR(overrides: Partial<SxIR> = {}): SxIR {
	return {
		atRules: [],
		base: {},
		selectors: [],
		variants: {},
		...overrides,
	};
}

const FAKE_EXPR = { name: "x", type: "Identifier" } as unknown as Expression;

describe("emitAtomic — stable hashing", () => {
	it("same input produces same class name across multiple calls", () => {
		const ir = makeIR({ base: { color: { kind: "static", text: "red" } } });
		const r1 = emitAtomic(ir, "prod");
		const r2 = emitAtomic(ir, "prod");
		expect(r1.classes[0]).toBe(r2.classes[0]);
	});

	it("different property+value → different hash", () => {
		const ir1 = makeIR({ base: { color: { kind: "static", text: "red" } } });
		const ir2 = makeIR({ base: { color: { kind: "static", text: "blue" } } });
		const r1 = emitAtomic(ir1, "prod");
		const r2 = emitAtomic(ir2, "prod");
		expect(r1.classes[0]).not.toBe(r2.classes[0]);
	});

	it("different selectors for same prop+value → different hashes (null-byte separator)", () => {
		const baseIR = makeIR({ base: { color: { kind: "static", text: "red" } } });
		const hoverIR = makeIR({
			selectors: [{ body: makeIR({ base: { color: { kind: "static", text: "red" } } }), sel: "&:hover" }],
		});
		const rBase = emitAtomic(baseIR, "prod");
		const rHover = emitAtomic(hoverIR, "prod");
		expect(rBase.classes[0]).not.toBe(rHover.classes[0]);
	});

	it("same triple from two calls → same class, cssRules has one entry (dedup)", () => {
		const ir = makeIR({ base: { padding: { kind: "static", text: "16px" } } });
		const r1 = emitAtomic(ir, "prod");
		const r2 = emitAtomic(ir, "prod");
		const merged = new Map([...r1.cssRules, ...r2.cssRules]);
		expect(merged.size).toBe(r1.cssRules.size);
		expect(r1.classes[0]).toBe(r2.classes[0]);
	});
});

describe("emitAtomic — prod mode class names", () => {
	it("prod: class is a1-<hash8>", () => {
		const ir = makeIR({ base: { color: { kind: "static", text: "red" } } });
		const { classes } = emitAtomic(ir, "prod");
		expect(classes[0]).toMatch(/^a1-[a-z0-9]{8}$/);
	});
});

describe("emitAtomic — dev mode class names", () => {
	it("dev: class is sx-<prop>-<value>-<hash4>", () => {
		const ir = makeIR({ base: { color: { kind: "static", text: "red" } } });
		const { classes } = emitAtomic(ir, "dev");
		expect(classes[0]).toMatch(/^sx-color-red-[a-z0-9]{4}$/);
	});

	it("dev: value with spaces gets dashes", () => {
		const ir = makeIR({ base: { margin: { kind: "static", text: "0 auto" } } });
		const { classes } = emitAtomic(ir, "dev");
		expect(classes[0]).toMatch(/^sx-margin-/);
	});
});

describe("emitAtomic — CSS rule output", () => {
	it("base property → plain class rule", () => {
		const ir = makeIR({ base: { color: { kind: "static", text: "red" } } });
		const { classes, cssRules } = emitAtomic(ir, "prod");
		const cls = classes[0];
		const rule = cssRules.get(cls);
		expect(rule).toBeDefined();
		expect(rule).toContain(`.${cls}`);
		expect(rule).toContain("color");
		expect(rule).toContain("red");
	});

	it("nested &:hover selector → scoped rule", () => {
		const ir = makeIR({
			selectors: [{ body: makeIR({ base: { color: { kind: "static", text: "blue" } } }), sel: "&:hover" }],
		});
		const { classes, cssRules } = emitAtomic(ir, "prod");
		const cls = classes[0];
		const rule = cssRules.get(cls);
		expect(rule).toBeDefined();
		expect(rule).toContain(`:hover`);
		expect(rule).toContain("color");
		expect(rule).toContain("blue");
	});

	it("nested &[data-active='true'] → attribute selector in rule", () => {
		const ir = makeIR({
			selectors: [
				{
					body: makeIR({ base: { background: { kind: "static", text: "green" } } }),
					sel: "&[data-active='true']",
				},
			],
		});
		const { classes, cssRules } = emitAtomic(ir, "prod");
		const cls = classes[0];
		const rule = cssRules.get(cls);
		expect(rule).toContain(`[data-active='true']`);
	});

	it("at-rule → rule wrapped correctly", () => {
		const ir = makeIR({
			atRules: [
				{
					at: "@media (min-width: 768px)",
					body: makeIR({ base: { padding: { kind: "static", text: "2rem" } } }),
				},
			],
		});
		const { classes, cssRules } = emitAtomic(ir, "prod");
		const cls = classes[0];
		const rule = cssRules.get(cls);
		expect(rule).toContain("@media (min-width: 768px)");
		expect(rule).toContain("padding");
		expect(rule).toContain("2rem");
	});

	it("variant → [data-<varName>=<value>] selector appended", () => {
		const ir = makeIR({
			variants: {
				size: {
					sm: makeIR({ base: { padding: { kind: "static", text: "4px" } } }),
				},
			},
		});
		const { classes, cssRules } = emitAtomic(ir, "prod");
		const cls = classes[0];
		const rule = cssRules.get(cls);
		expect(rule).toContain(`[data-size="sm"]`);
		expect(rule).toContain("padding");
		expect(rule).toContain("4px");
	});
});

describe("emitAtomic — dynamic values", () => {
	it("dynamic value → CSS var in rule, vars array populated", () => {
		const ir = makeIR({ base: { color: { exprNode: FAKE_EXPR, kind: "dynamic" } } });
		const { classes, cssRules, vars } = emitAtomic(ir, "prod");
		const cls = classes[0];
		const rule = cssRules.get(cls);
		expect(rule).toContain("var(--_0)");
		expect(vars).toHaveLength(1);
		expect(vars[0].index).toBe(0);
		expect(vars[0].exprNode).toBe(FAKE_EXPR);
	});

	it("two dynamic values in same IR → indexed --_0, --_1", () => {
		const ir = makeIR({
			base: {
				background: { exprNode: FAKE_EXPR, kind: "dynamic" },
				color: { exprNode: FAKE_EXPR, kind: "dynamic" },
			},
		});
		const { vars } = emitAtomic(ir, "prod");
		expect(vars).toHaveLength(2);
		expect(vars[0].index).toBe(0);
		expect(vars[1].index).toBe(1);
	});
});

describe("emitAtomic — empty IR", () => {
	it("empty IR → no classes, no rules, no vars", () => {
		const ir = makeIR();
		const { classes, cssRules, vars } = emitAtomic(ir, "prod");
		expect(classes).toHaveLength(0);
		expect(cssRules.size).toBe(0);
		expect(vars).toHaveLength(0);
	});
});

describe("emitAtomic — camelCase property → kebab-case in CSS rule (line 54)", () => {
	it("backgroundColor → background-color in emitted rule", () => {
		const ir = makeIR({ base: { backgroundColor: { kind: "static", text: "blue" } } });
		const { classes, cssRules } = emitAtomic(ir, "prod");
		const rule = cssRules.get(classes[0]);
		expect(rule).toBeDefined();
		expect(rule).toContain("background-color");
		expect(rule).not.toContain("backgroundColor");
	});

	it("fontSize → font-size in emitted rule", () => {
		const ir = makeIR({ base: { fontSize: { kind: "static", text: "16px" } } });
		const { classes, cssRules } = emitAtomic(ir, "prod");
		const rule = cssRules.get(classes[0]);
		expect(rule).toContain("font-size");
	});

	it("WebkitTransform vendor prefix → -webkit-transform", () => {
		const ir = makeIR({ base: { WebkitTransform: { kind: "static", text: "rotate(45deg)" } } });
		const { classes, cssRules } = emitAtomic(ir, "prod");
		const rule = cssRules.get(classes[0]);
		expect(rule).toContain("-webkit-transform");
	});
});

describe("emitAtomic — selector without & (no & in sel string)", () => {
	it("selector without & → prepended to class (expandSelector fallback)", () => {
		/*
		 * expandSelector: if sel has no &, returns `${parentSelector}${sel}`.
		 * The parentSelector from nested IR is the base selector; sel without & is appended.
		 */
		const ir = makeIR({
			selectors: [
				{
					body: makeIR({ base: { color: { kind: "static", text: "red" } } }),
					sel: ":focus",
				},
			],
		});
		const { classes, cssRules } = emitAtomic(ir, "prod");
		const rule = cssRules.get(classes[0]);
		expect(rule).toBeDefined();
		expect(rule).toContain(":focus");
	});

	it("sibling combinator selector (& + *) → expands & to class", () => {
		const ir = makeIR({
			selectors: [
				{
					body: makeIR({ base: { margin: { kind: "static", text: "0" } } }),
					sel: "& + *",
				},
			],
		});
		const { classes, cssRules } = emitAtomic(ir, "prod");
		const rule = cssRules.get(classes[0]);
		expect(rule).toBeDefined();
		expect(rule).toContain(" + *");
	});
});

describe("emitAtomic — variant with parentSelector already set", () => {
	it("variant on element that already has nested selectors in base → combined selector", () => {
		const ir = makeIR({
			variants: {
				intent: {
					primary: makeIR({ base: { color: { kind: "static", text: "blue" } } }),
				},
			},
		});
		const { classes, cssRules } = emitAtomic(ir, "prod");
		const cls = classes[0];
		const rule = cssRules.get(cls);
		expect(rule).toContain('[data-intent="primary"]');
	});
});

describe("emitAtomic — at-rule with nested selector inside", () => {
	it("@supports nesting → class rule wrapped in @supports", () => {
		const ir = makeIR({
			atRules: [
				{
					at: "@supports (display: grid)",
					body: makeIR({ base: { display: { kind: "static", text: "grid" } } }),
				},
			],
		});
		const { classes, cssRules } = emitAtomic(ir, "prod");
		const rule = cssRules.get(classes[0]);
		expect(rule).toContain("@supports (display: grid)");
		expect(rule).toContain("display");
		expect(rule).toContain("grid");
	});

	it("@container nesting → class rule wrapped in @container", () => {
		const ir = makeIR({
			atRules: [
				{
					at: "@container sidebar (min-width: 200px)",
					body: makeIR({ base: { padding: { kind: "static", text: "1rem" } } }),
				},
			],
		});
		const { classes, cssRules } = emitAtomic(ir, "prod");
		const rule = cssRules.get(classes[0]);
		expect(rule).toContain("@container sidebar");
	});
});

describe("emitAtomic — dedup within same emitAtomic call (line 85 cssRules.has guard)", () => {
	it("two at-rules with identical parentSelector+prop+value → same class, cssRules entry added only once", () => {
		/*
		 * Both at-rules have the same parentSelector ("") and same base prop.
		 * emitIR calls emitDeclarations twice with cssSelector="" and prop+value identical.
		 * The class hash is the same → ctx.cssRules.has(cls) is true on the second call → `continue`.
		 * ctx.classes still receives the class name twice; cssRules has exactly one entry.
		 */
		const ir = makeIR({
			atRules: [
				{
					at: "@media (min-width: 768px)",
					body: makeIR({ base: { color: { kind: "static", text: "red" } } }),
				},
				{
					at: "@media (min-width: 1024px)",
					body: makeIR({ base: { color: { kind: "static", text: "red" } } }),
				},
			],
		});
		const { classes, cssRules } = emitAtomic(ir, "prod");
		/* Both at-rules yield the same class name (same selector+prop+value triple) */
		expect(classes[0]).toBe(classes[1]);
		/* cssRules deduped — only one entry for this class */
		expect(cssRules.size).toBe(1);
	});
});

describe("emitAtomic — nested selector with non-empty parentSelector (lines 113-126)", () => {
	it("selector nested under another selector → expandSelector called with non-empty parentSelector", () => {
		/*
		 * emitIR: when parentSelector !== "", the nested selector resolution uses expandSelector.
		 * This exercises the `parentSelector === "" ? sel : expandSelector(parentSelector, sel)` branch
		 * at line 113.
		 */
		const innerBody = makeIR({ base: { color: { kind: "static", text: "red" } } });
		const outerBody = makeIR({
			selectors: [{ body: innerBody, sel: "&:focus" }],
		});
		const ir = makeIR({
			selectors: [{ body: outerBody, sel: "&:hover" }],
		});
		const { classes, cssRules } = emitAtomic(ir, "prod");
		expect(classes).toHaveLength(1);
		const rule = cssRules.get(classes[0]);
		expect(rule).toBeDefined();
		/* Rule should contain both :hover and :focus selectors combined */
		expect(rule).toContain(":hover");
		expect(rule).toContain(":focus");
	});

	it("variant with non-empty parentSelector from enclosing selector → combined selector string", () => {
		/*
		 * A variant inside a nested selector body — parentSelector is already set
		 * when emitIR recurses into the variant.
		 * Exercises the `parentSelector === "" ? \`&${varSel}\` : \`${parentSelector}${varSel}\`` branch
		 * at lines 126-127 with parentSelector !== "".
		 */
		const variantBody = makeIR({ base: { color: { kind: "static", text: "blue" } } });
		const selectorBody = makeIR({
			variants: {
				size: { sm: variantBody },
			},
		});
		const ir = makeIR({
			selectors: [{ body: selectorBody, sel: "&:hover" }],
		});
		const { classes, cssRules } = emitAtomic(ir, "prod");
		expect(classes).toHaveLength(1);
		const rule = cssRules.get(classes[0]);
		expect(rule).toBeDefined();
		expect(rule).toContain(":hover");
		expect(rule).toContain('[data-size="sm"]');
	});
});
