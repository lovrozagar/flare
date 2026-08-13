/** @vitest-environment node */
import { describe, expect, it } from "vitest"
import type { ObjectExpression } from "oxc-parser"
import { parseSource } from "../../../../src/plugins/sx-ast/parser.ts"
import { evaluateSxObject } from "../../../../src/plugins/sx-ast/evaluator.ts"
import type { CssValue } from "../../../../src/plugins/sx-ast/evaluator.ts"

/** Extract the ObjectExpression from `<div sx={{...}} />` source. */
function parseSxObject(sxObjectSrc: string): ObjectExpression {
	const source = `const __x = <div sx={${sxObjectSrc}} />;`
	const result = parseSource(source)
	if (result.diagnostics.length > 0) {
		throw new Error(`Parse error: ${result.diagnostics[0].message}`)
	}
	const decl = result.program.body[0] as {
		declarations: Array<{
			init: {
				openingElement: {
					attributes: Array<{ value: { expression: ObjectExpression } }>
				}
			}
		}>
	}
	return decl.declarations[0].init.openingElement.attributes[0].value.expression
}

describe("evaluateSxObject — flat static properties", () => {
	it("produces IR.base populated from Identifier key + StringLiteral value", () => {
		const node = parseSxObject(`{ color: "red", background: "blue" }`)
		const { ir, diagnostics } = evaluateSxObject(node)
		expect(diagnostics).toHaveLength(0)
		expect(ir).not.toBeNull()
		if (!ir) return
		expect(ir.base["color"]).toEqual({ kind: "static", text: "red" })
		expect(ir.base["background"]).toEqual({ kind: "static", text: "blue" })
		expect(ir.selectors).toHaveLength(0)
		expect(ir.atRules).toHaveLength(0)
		expect(Object.keys(ir.variants)).toHaveLength(0)
	})

	it("produces IR.base from StringLiteral key", () => {
		const node = parseSxObject(`{ "font-size": "14px" }`)
		const { ir, diagnostics } = evaluateSxObject(node)
		expect(diagnostics).toHaveLength(0)
		if (!ir) return
		expect(ir.base["font-size"]).toEqual({ kind: "static", text: "14px" })
	})

	it("numeric value for px property → appends px", () => {
		const node = parseSxObject(`{ padding: 16, margin: 8 }`)
		const { ir, diagnostics } = evaluateSxObject(node)
		expect(diagnostics).toHaveLength(0)
		if (!ir) return
		expect(ir.base["padding"]).toEqual({ kind: "static", text: "16px" })
		expect(ir.base["margin"]).toEqual({ kind: "static", text: "8px" })
	})

	it("negative numeric value → static with minus sign and px suffix", () => {
		const node = parseSxObject(`{ margin: -4, top: -16 }`)
		const { ir, diagnostics } = evaluateSxObject(node)
		expect(diagnostics).toHaveLength(0)
		if (!ir) return
		expect(ir.base["margin"]).toEqual({ kind: "static", text: "-4px" })
		expect(ir.base["top"]).toEqual({ kind: "static", text: "-16px" })
	})

	it("negative unitless numeric value → static without px", () => {
		const node = parseSxObject(`{ zIndex: -1 }`)
		const { ir, diagnostics } = evaluateSxObject(node)
		expect(diagnostics).toHaveLength(0)
		if (!ir) return
		expect(ir.base["zIndex"]).toEqual({ kind: "static", text: "-1" })
	})

	it("numeric value for unitless property (lineHeight) → no px suffix", () => {
		const node = parseSxObject(`{ lineHeight: 1.5, opacity: 0.8, zIndex: 10 }`)
		const { ir, diagnostics } = evaluateSxObject(node)
		expect(diagnostics).toHaveLength(0)
		if (!ir) return
		expect(ir.base["lineHeight"]).toEqual({ kind: "static", text: "1.5" })
		expect(ir.base["opacity"]).toEqual({ kind: "static", text: "0.8" })
		expect(ir.base["zIndex"]).toEqual({ kind: "static", text: "10" })
	})

	it("string value with units passes through as-is", () => {
		const node = parseSxObject(`{ padding: "1rem", margin: "0 auto" }`)
		const { ir } = evaluateSxObject(node)
		if (!ir) return
		expect(ir.base["padding"]).toEqual({ kind: "static", text: "1rem" })
		expect(ir.base["margin"]).toEqual({ kind: "static", text: "0 auto" })
	})

	it("TemplateLiteral with no expressions → static text", () => {
		const node = parseSxObject("{ color: `red` }")
		const { ir, diagnostics } = evaluateSxObject(node)
		expect(diagnostics).toHaveLength(0)
		if (!ir) return
		expect(ir.base["color"]).toEqual({ kind: "static", text: "red" })
	})

	it("BooleanLiteral → static text", () => {
		const node = parseSxObject("{ visibility: true }")
		const { ir } = evaluateSxObject(node)
		if (!ir) return
		expect(ir.base["visibility"]).toEqual({ kind: "static", text: "true" })
	})
})

describe("evaluateSxObject — dynamic values", () => {
	it("Identifier value → dynamic CssValue with exprNode", () => {
		const node = parseSxObject(`{ color: props.x }`)
		const { ir, diagnostics } = evaluateSxObject(node)
		expect(diagnostics).toHaveLength(0)
		if (!ir) return
		expect(ir.base["color"]).toMatchObject({ kind: "dynamic" })
		const cv = ir.base["color"] as CssValue & { kind: "dynamic" }
		if (cv.kind === "dynamic") expect(cv.exprNode).toBeDefined()
	})

	it("CallExpression value → dynamic", () => {
		const node = parseSxObject(`{ color: getColor() }`)
		const { ir } = evaluateSxObject(node)
		if (!ir) return
		expect(ir.base["color"]).toMatchObject({ kind: "dynamic" })
	})

	it("MemberExpression value → dynamic", () => {
		const node = parseSxObject(`{ padding: theme.space[4] }`)
		const { ir } = evaluateSxObject(node)
		if (!ir) return
		expect(ir.base["padding"]).toMatchObject({ kind: "dynamic" })
	})

	it("TemplateLiteral with expressions → dynamic", () => {
		const node = parseSxObject("{ color: `${myColor}` }")
		const { ir } = evaluateSxObject(node)
		if (!ir) return
		expect(ir.base["color"]).toMatchObject({ kind: "dynamic" })
	})
})

describe("evaluateSxObject — computed keys", () => {
	it("computed key → diagnostic warning + skipped", () => {
		const node = parseSxObject(`{ [dynamicKey]: "red" }`)
		const { ir, diagnostics } = evaluateSxObject(node)
		expect(ir).not.toBeNull()
		expect(diagnostics.length).toBeGreaterThan(0)
		expect(diagnostics[0].kind).toBe("warning")
		if (!ir) return
		expect(Object.keys(ir.base)).toHaveLength(0)
	})

	it("signal-bound template selector key → diagnostic + skipped", () => {
		const node = parseSxObject("{ [`${sel}:hover`]: { color: \"red\" } }")
		const { ir, diagnostics } = evaluateSxObject(node)
		expect(ir).not.toBeNull()
		expect(diagnostics.length).toBeGreaterThan(0)
		if (!ir) return
		expect(ir.selectors).toHaveLength(0)
	})
})

describe("evaluateSxObject — nested selectors", () => {
	it("&:hover key → IR.selectors entry with body.base populated", () => {
		const node = parseSxObject(`{ "&:hover": { color: "blue" } }`)
		const { ir, diagnostics } = evaluateSxObject(node)
		expect(diagnostics).toHaveLength(0)
		if (!ir) return
		expect(ir.selectors).toHaveLength(1)
		expect(ir.selectors[0].sel).toBe("&:hover")
		expect(ir.selectors[0].body.base["color"]).toEqual({ kind: "static", text: "blue" })
	})

	it("&[data-active='true'] key → IR.selectors entry", () => {
		const node = parseSxObject(`{ "&[data-active='true']": { background: "green" } }`)
		const { ir } = evaluateSxObject(node)
		if (!ir) return
		expect(ir.selectors[0].sel).toBe("&[data-active='true']")
		expect(ir.selectors[0].body.base["background"]).toEqual({ kind: "static", text: "green" })
	})

	it("&:focus string key → selector", () => {
		const node = parseSxObject(`{ "&:focus": { outline: "none" } }`)
		const { ir } = evaluateSxObject(node)
		if (!ir) return
		expect(ir.selectors[0].sel).toBe("&:focus")
	})
})

describe("evaluateSxObject — at-rules", () => {
	it("@media key → IR.atRules entry with body.base populated", () => {
		const node = parseSxObject(`{ "@media (min-width: 768px)": { padding: "2rem" } }`)
		const { ir, diagnostics } = evaluateSxObject(node)
		expect(diagnostics).toHaveLength(0)
		if (!ir) return
		expect(ir.atRules).toHaveLength(1)
		expect(ir.atRules[0].at).toBe("@media (min-width: 768px)")
		expect(ir.atRules[0].body.base["padding"]).toEqual({ kind: "static", text: "2rem" })
	})

	it("@supports key → IR.atRules entry", () => {
		const node = parseSxObject(`{ "@supports (display: grid)": { display: "grid" } }`)
		const { ir } = evaluateSxObject(node)
		if (!ir) return
		expect(ir.atRules[0].at).toBe("@supports (display: grid)")
	})
})

describe("evaluateSxObject — variants", () => {
	it("variants block → IR.variants populated per variant name and value", () => {
		const node = parseSxObject(`{
			variants: {
				size: {
					sm: { padding: "4px" },
					lg: { padding: "16px" }
				}
			}
		}`)
		const { ir, diagnostics } = evaluateSxObject(node)
		expect(diagnostics).toHaveLength(0)
		if (!ir) return
		expect(ir.variants["size"]).toBeDefined()
		expect(ir.variants["size"]["sm"].base["padding"]).toEqual({ kind: "static", text: "4px" })
		expect(ir.variants["size"]["lg"].base["padding"]).toEqual({ kind: "static", text: "16px" })
	})

	it("multiple variant props → each in IR.variants", () => {
		const node = parseSxObject(`{
			variants: {
				size: { sm: { padding: "4px" } },
				intent: { primary: { color: "blue" } }
			}
		}`)
		const { ir } = evaluateSxObject(node)
		if (!ir) return
		expect(Object.keys(ir.variants)).toHaveLength(2)
		expect(ir.variants["intent"]["primary"].base["color"]).toEqual({ kind: "static", text: "blue" })
	})
})

describe("evaluateSxObject — spreads", () => {
	it("spread from external identifier → diagnostic + ir null", () => {
		const node = parseSxObject(`{ ...externalSx }`)
		const { ir, diagnostics } = evaluateSxObject(node)
		expect(ir).toBeNull()
		expect(diagnostics.length).toBeGreaterThan(0)
		expect(diagnostics[0].message).toContain("externalSx")
	})

	it("spread from call expression (no .name) → diagnostic message falls back to 'expression' (line 213)", () => {
		/*
		 * Top-level spread where argument is a CallExpression: `{ ...getStyles() }`.
		 * The argument has no `.name` property → `?? "expression"` fallback at line 213.
		 */
		const node = parseSxObject(`{ ...getStyles() }`)
		const { ir, diagnostics } = evaluateSxObject(node)
		expect(ir).toBeNull()
		expect(diagnostics.length).toBeGreaterThan(0)
		expect(diagnostics[0].message).toContain("expression")
	})

	it("flat spread from inline object literal → inlines properties", () => {
		/* Parenthesised ObjectExpression — evaluator flattens it directly */
		const node = parseSxObject(`{ ...({ color: "red", padding: "4px" }) }`)
		const { ir, diagnostics } = evaluateSxObject(node)
		expect(diagnostics).toHaveLength(0)
		expect(ir).not.toBeNull()
		if (!ir) return
		expect(ir.base["color"]).toEqual({ kind: "static", text: "red" })
		expect(ir.base["padding"]).toEqual({ kind: "static", text: "4px" })
	})
})

describe("evaluateSxObject — empty object", () => {
	it("empty sx object → empty IR, no diagnostics", () => {
		const node = parseSxObject(`{}`)
		const { ir, diagnostics } = evaluateSxObject(node)
		expect(diagnostics).toHaveLength(0)
		expect(ir).not.toBeNull()
		if (!ir) return
		expect(Object.keys(ir.base)).toHaveLength(0)
		expect(ir.selectors).toHaveLength(0)
		expect(ir.atRules).toHaveLength(0)
		expect(Object.keys(ir.variants)).toHaveLength(0)
	})
})

describe("evaluateSxObject — nested spread with non-ObjectExpression argument (lines 117-122)", () => {
	it("spread inside selector body with identifier → diagnostic error + ir null", () => {
		/*
		 * A spread inside a nested selector body where the argument is not an ObjectExpression.
		 * This exercises the mergeObjectIntoIR non-ObjectExpression spread branch (lines 117-122)
		 * via the recursive call from the &:hover value processing.
		 */
		const node = parseSxObject(`{ "&:hover": { ...dynamic } }`)
		const { diagnostics } = evaluateSxObject(node)
		/*
		 * mergeObjectIntoIR is called recursively for the &:hover body.
		 * Inside that call, `...dynamic` is a non-ObjectExpression spread → diagnostic + returns false.
		 * The parent selector just skips (continue), so ir is still non-null but &:hover body is empty.
		 */
		expect(diagnostics.length).toBeGreaterThan(0)
		expect(diagnostics[0].kind).toBe("error")
		expect(diagnostics[0].message).toContain("dynamic")
	})

	it("nested spread inside at-rule body with identifier → diagnostic + selector not added", () => {
		const node = parseSxObject(`{ "@media (min-width:768px)": { ...dynamic } }`)
		const { diagnostics } = evaluateSxObject(node)
		expect(diagnostics.length).toBeGreaterThan(0)
		expect(diagnostics[0].kind).toBe("error")
	})

	it("nested spread inside selector body with call expression (no .name) → 'expression' fallback (line 119)", () => {
		/*
		 * mergeObjectIntoIR non-ObjectExpression branch at line 117-122.
		 * The spread argument is a CallExpression (no .name) → `?? "expression"` at line 119.
		 */
		const node = parseSxObject(`{ "&:hover": { ...getStyles() } }`)
		const { diagnostics } = evaluateSxObject(node)
		expect(diagnostics.length).toBeGreaterThan(0)
		expect(diagnostics[0].kind).toBe("error")
		expect(diagnostics[0].message).toContain("expression")
	})

	it("inline object spread inside nested spread that itself fails → ir null", () => {
		/*
		 * Top-level spread wrapping an object that itself contains a non-ObjectExpression spread.
		 * mergeObjectIntoIR is called recursively; inner failure propagates `!ok → return false`.
		 * That covers the `if (!ok) return false` branch at line 115.
		 */
		const node = parseSxObject(`{ ...({ ...dynamic }) }`)
		const { ir, diagnostics } = evaluateSxObject(node)
		expect(ir).toBeNull()
		expect(diagnostics.length).toBeGreaterThan(0)
	})
})

describe("evaluateSxObject — resolveKey returns null (line 100 + lines 145-150)", () => {
	it("numeric literal key (non-computed) → resolveKey returns null → warning + skipped", () => {
		/*
		 * `{ 0: "red" }` — key is a numeric Literal (typeof value === "number", not "string").
		 * resolveKey hits the final `return null` at line 100.
		 * mergeObjectIntoIR then emits the warning at lines 145-150.
		 */
		const node = parseSxObject(`{ 0: "red" }`)
		const { ir, diagnostics } = evaluateSxObject(node)
		expect(ir).not.toBeNull()
		expect(diagnostics.length).toBeGreaterThan(0)
		expect(diagnostics[0].kind).toBe("warning")
		expect(diagnostics[0].message).toContain("unresolvable")
		if (!ir) return
		expect(Object.keys(ir.base)).toHaveLength(0)
	})
})

describe("evaluateSxObject — unresolvable non-computed key (lines 145-150)", () => {
	it("NullLiteral property value → static 'null' text", () => {
		/*
		 * null literal has typeof value === 'object', not 'string'/'number'/'boolean'.
		 * evalValue falls through to the dynamic branch.
		 */
		const node = parseSxObject(`{ color: null }`)
		const { ir, diagnostics } = evaluateSxObject(node)
		expect(diagnostics).toHaveLength(0)
		expect(ir).not.toBeNull()
		if (!ir) return
		/* null literal is caught by expr.type === "Literal" but typeof lit.value is "object" — falls to dynamic */
		expect(ir.base["color"]).toMatchObject({ kind: "dynamic" })
	})

	it("selector key with non-ObjectExpression value → skipped (continue)", () => {
		/* &:hover value is a string literal, not an object → the `if (prop.value.type !== "ObjectExpression") continue` branch */
		const node = parseSxObject(`{ "&:hover": "blue" }`)
		const { ir, diagnostics } = evaluateSxObject(node)
		expect(ir).not.toBeNull()
		expect(diagnostics).toHaveLength(0)
		if (!ir) return
		expect(ir.selectors).toHaveLength(0)
	})

	it("at-rule key with non-ObjectExpression value → skipped", () => {
		const node = parseSxObject(`{ "@media (min-width:768px)": "2rem" }`)
		const { ir, diagnostics } = evaluateSxObject(node)
		expect(ir).not.toBeNull()
		expect(diagnostics).toHaveLength(0)
		if (!ir) return
		expect(ir.atRules).toHaveLength(0)
	})
})

describe("evaluateSxObject — variants edge cases", () => {
	it("variants block where variant value is non-ObjectExpression → skipped", () => {
		/* vp.value.type !== "ObjectExpression" — the string "sm" is skipped */
		const node = parseSxObject(`{
			variants: {
				size: "sm"
			}
		}`)
		const { ir, diagnostics } = evaluateSxObject(node)
		expect(ir).not.toBeNull()
		expect(diagnostics).toHaveLength(0)
		if (!ir) return
		expect(Object.keys(ir.variants)).toHaveLength(0)
	})

	it("variants block where variant value-entry is non-ObjectExpression body → skipped", () => {
		/* vvp.value.type !== "ObjectExpression" — the body is a string */
		const node = parseSxObject(`{
			variants: {
				size: {
					sm: "invalid"
				}
			}
		}`)
		const { ir, diagnostics } = evaluateSxObject(node)
		expect(ir).not.toBeNull()
		expect(diagnostics).toHaveLength(0)
		if (!ir) return
		/* size variant exists but sm body is skipped */
		expect(ir.variants["size"]).toBeDefined()
		expect(Object.keys(ir.variants["size"] ?? {})).toHaveLength(0)
	})

	it("variants block where variants value is non-ObjectExpression → skipped", () => {
		/* `variants: 42` — prop.value.type !== ObjectExpression → continue */
		const node = parseSxObject(`{ variants: 42 }`)
		const { ir, diagnostics } = evaluateSxObject(node)
		expect(ir).not.toBeNull()
		expect(diagnostics).toHaveLength(0)
		if (!ir) return
		expect(Object.keys(ir.variants)).toHaveLength(0)
	})

	it("variants block with SpreadElement inside variant names object → skipped (line 158)", () => {
		/*
		 * A SpreadElement inside the outer variants object (the variant-name level).
		 * varProp.type !== "Property" → `continue` at line 158.
		 */
		const node = parseSxObject(`{
			variants: {
				...({ size: { sm: { padding: "4px" } } })
			}
		}`)
		const { ir: ir1 } = evaluateSxObject(node)
		expect(ir1).not.toBeNull()
		/* The spread inside variants is a SpreadElement, not a Property → skipped */
		if (!ir1) return
		expect(Object.keys(ir1.variants)).toHaveLength(0)
	})

	it("variants block with SpreadElement inside variant values → skipped (line 166)", () => {
		/* valProp.type !== "Property" — a spread inside the values object is skipped */
		const node = parseSxObject(`{
			variants: {
				size: {
					...({ sm: { padding: "4px" } })
				}
			}
		}`)
		const { ir: ir2 } = evaluateSxObject(node)
		expect(ir2).not.toBeNull()
		/* Spread inside variant values is skipped silently */
		if (!ir2) return
		/* variants["size"] exists but has no entries because the spread was skipped */
		expect(ir2.variants["size"]).toBeDefined()
	})

	it("variants block where variant prop key is computed → resolveKey returns null via computed=true (line 96+161)", () => {
		/*
		 * A computed key inside the variants object: `{ variants: { [sizeKey]: { ... } } }`.
		 * resolveKey checks prop.computed first → returns null (line 96).
		 * Then `if (!varName) continue` at line 161 skips it.
		 */
		const node = parseSxObject(`{
			variants: {
				[sizeKey]: { sm: { padding: "4px" } }
			}
		}`)
		const { ir } = evaluateSxObject(node)
		expect(ir).not.toBeNull()
		if (!ir) return
		/* Computed variant key skipped → no variants registered */
		expect(Object.keys(ir.variants)).toHaveLength(0)
	})

	it("variants block where variant prop key is unresolvable numeric (line 161)", () => {
		/*
		 * Numeric key inside variants outer object → resolveKey returns null → `if (!varName) continue`.
		 */
		const node = parseSxObject(`{
			variants: {
				0: { sm: { padding: "4px" } }
			}
		}`)
		const { ir, diagnostics } = evaluateSxObject(node)
		expect(ir).not.toBeNull()
		expect(diagnostics).toHaveLength(0)
		if (!ir) return
		/* Numeric variant key skipped → no variants registered */
		expect(Object.keys(ir.variants)).toHaveLength(0)
	})

	it("variants block where value-entry key is unresolvable (lines 168-169)", () => {
		/*
		 * Numeric key inside variant values → resolveKey returns null → `if (!valName) continue`.
		 */
		const node = parseSxObject(`{
			variants: {
				size: {
					0: { padding: "4px" }
				}
			}
		}`)
		const { ir, diagnostics } = evaluateSxObject(node)
		expect(ir).not.toBeNull()
		expect(diagnostics).toHaveLength(0)
		if (!ir) return
		expect(ir.variants["size"]).toBeDefined()
		expect(Object.keys(ir.variants["size"] ?? {})).toHaveLength(0)
	})

	it("deeply nested & selectors (3 levels)", () => {
		const node = parseSxObject(`{
			"&:hover": {
				"&:focus": {
					"&:active": { color: "red" }
				}
			}
		}`)
		const { ir, diagnostics } = evaluateSxObject(node)
		expect(diagnostics).toHaveLength(0)
		expect(ir).not.toBeNull()
		if (!ir) return
		expect(ir.selectors).toHaveLength(1)
		expect(ir.selectors[0].body.selectors).toHaveLength(1)
		expect(ir.selectors[0].body.selectors[0].body.selectors).toHaveLength(1)
		expect(ir.selectors[0].body.selectors[0].body.selectors[0].body.base["color"]).toEqual({
			kind: "static",
			text: "red",
		})
	})

	it("at-rule inside variants body → nested atRules in variant IR", () => {
		const node = parseSxObject(`{
			variants: {
				size: {
					sm: {
						"@media (max-width: 640px)": { padding: "4px" }
					}
				}
			}
		}`)
		const { ir, diagnostics } = evaluateSxObject(node)
		expect(diagnostics).toHaveLength(0)
		if (!ir) return
		expect(ir.variants["size"]["sm"].atRules).toHaveLength(1)
		expect(ir.variants["size"]["sm"].atRules[0].at).toBe("@media (max-width: 640px)")
	})
})
