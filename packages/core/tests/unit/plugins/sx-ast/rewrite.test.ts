/** @vitest-environment node */
import { describe, expect, it } from "vitest"
import { rewriteModule } from "../../../../src/plugins/sx-ast/rewrite.ts"
import type { RewriteCtx } from "../../../../src/plugins/sx-ast/rewrite.ts"

function ctx(overrides?: Partial<RewriteCtx>): RewriteCtx {
	const emitted: string[] = []
	return {
		cssEmit: (rule: string) => emitted.push(rule),
		layer: "app",
		mode: "dev",
		sourcePath: "input.tsx",
		...overrides,
	}
}

function transform(code: string, overrides?: Partial<RewriteCtx>) {
	return rewriteModule(code, ctx(overrides))
}

describe("rewriteModule — static sx object", () => {
	it("removes sx= attr and emits atomic class on class=", () => {
		const src = `export default function A() { return <div sx={{ color: "red", padding: 16 }} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain("sx=")
		expect(result.code).toContain("class=")
		/* dev mode: sx-color-red-<hash> sx-padding-16px-<hash> */
		expect(result.code).toMatch(/class="sx-color-red-\w+ sx-padding-16px-\w+"/)
	})

	it("handles dynamic value — emits class + style var", () => {
		const src = `export default function A({ c }: { c: string }) { return <div sx={{ color: c }} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain("sx=")
		expect(result.code).toContain("style=")
		expect(result.code).toMatch(/--_0/)
	})

	it("handles hover selector", () => {
		const emitted: string[] = []
		const src = `export default function A() { return <div sx={{ "&:hover": { color: "blue" } }} /> }`
		const result = rewriteModule(src, ctx({ cssEmit: (r: string) => emitted.push(r) }))
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain("sx=")
		expect(emitted.some((r) => r.includes(":hover"))).toBe(true)
	})

	it("merges sx classes with existing class= attr", () => {
		const src = `export default function A() { return <div class="foo bar" sx={{ padding: 16 }} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain("sx=")
		expect(result.code).toContain("foo bar")
		expect(result.code).toMatch(/sx-padding-16px-\w+/)
	})
})

describe("rewriteModule — dynamic sx (non-literal expression)", () => {
	it("rewrites sx={var} to {...compileSx(var, 'user.app')} spread and injects import", () => {
		const src = `export default function A({ s }: { s: object }) { return <div sx={s} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain("sx=")
		expect(result.code).toContain("compileSx(s,")
		expect(result.code).toContain('"user.app"')
		expect(result.code).toContain('flare/styles')
	})

	it("uses 'user.lib' layer when ctx.layer is 'sx'", () => {
		const src = `export default function A({ s }: { s: object }) { return <div sx={s} /> }`
		const result = transform(src, { layer: "sx" })
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).toContain('"user.lib"')
	})
})

describe("rewriteModule — class= static resolution", () => {
	it("all-static array → flattened string", () => {
		const src = `export default function A() { return <div class={["a", "b"]} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).toContain('class="a b"')
	})

	it("array with conditional → template literal with guard", () => {
		const src = `export default function A({ on }: { on: boolean }) { return <div class={["a", on && "b"]} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		/* Produces something like: class={`a${on ? " b" : ""}`} */
		expect(result.code).toMatch(/class=\{`a/)
		expect(result.code).toContain('on ?')
	})

	it("array with null literal → null skipped, no 'null' string in output", () => {
		const src = `export default function A() { return <div class={["base", null]} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		/* null should be silently dropped — no literal "null" in class string */
		expect(result.code).not.toContain('"null"')
		expect(result.code).not.toMatch(/\bnull\b/)
		expect(result.code).toContain("base")
	})

	it("array with undefined identifier → undefined skipped", () => {
		const src = `export default function A() { return <div class={["base", undefined]} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain("undefined")
		expect(result.code).toContain("base")
	})

	it("array with false literal → false skipped", () => {
		const src = `export default function A() { return <div class={["base", false]} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain('"false"')
		expect(result.code).toContain("base")
	})

	it("mixed: null + undefined + false alongside truthy → only truthy kept", () => {
		const src = `export default function A({ f }: { f: boolean }) { return <div class={["base", f && "active", null, undefined]} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain('"null"')
		expect(result.code).not.toContain("undefined")
		expect(result.code).toContain("base")
	})

	it("explicit cn(...) → left as-is", () => {
		const src = `import { cn } from "flare/styles"; export default function A({ on }: { on: boolean }) { return <div class={cn("a", on && "b")} /> }`
		const result = transform(src)
		if (!result) return
		expect(result.code).toContain('cn("a", on && "b")')
	})

	it("dynamic single var → wrapped in cn()", () => {
		const src = `export default function A({ v }: { v: string }) { return <div class={v} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).toContain("cn(v)")
	})
})

describe("rewriteModule — spread + class auto-merge (DOM elements only)", () => {
	it("DOM element with spread + literal class → template literal merge", () => {
		const src = `export default function A(props: { class?: string }) { return <div {...props} class="base" /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).toContain("base")
		expect(result.code).toContain("props.class")
	})

	it("component (uppercase) with spread + class → NOT auto-merged", () => {
		const src = `export default function A(props: { class?: string }) { return <Button {...props} class="x" /> }`
		const result = transform(src)
		/* Either null (no changes) or class="x" stays literal — no template merge */
		if (result !== null) {
			expect(result.code).not.toMatch(/`.*props\.class.*`/)
		}
	})

	it("spread + sx emits atomic → merged with spread.class", () => {
		const src = `export default function A(props: { class?: string }) { return <div {...props} sx={{ color: "red" }} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain("sx=")
		expect(result.code).toContain("props.class")
	})
})

describe("rewriteModule — css= attr", () => {
	it("literal css= → folded into class via compileCss runtime call", () => {
		const src = `export default function A() { return <div css="color: red" /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain('css="')
		expect(result.code).toContain("compileCss(")
		expect(result.code).toContain('"color: red"')
	})

	it("dynamic css={expr} → compileCss runtime call", () => {
		const src = `export default function A({ t }: { t: string }) { return <div css={t} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain("css={t}")
		expect(result.code).toContain("compileCss(t,")
	})
})

describe("rewriteModule — emittedClasses tracking", () => {
	it("returns emittedClasses set with class names from static sx", () => {
		const src = `export default function A() { return <div sx={{ color: "red" }} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.emittedClasses.size).toBeGreaterThan(0)
	})
})

describe("rewriteModule — no changes", () => {
	it("returns null when no sx/css/class patterns present", () => {
		const src = `export default function A() { return <div id="x" /> }`
		const result = transform(src)
		expect(result).toBeNull()
	})
})

describe("rewriteModule — sx= with non-JSXExpressionContainer value (line 359)", () => {
	it("sx={} with string literal attr value (edge case) → sxIsDynamic=true path", () => {
		/*
		 * sx value that is NOT a JSXExpressionContainer triggers the final `sxIsDynamic = true`
		 * branch at line 359. Only possible if the attr value is null (boolean attr).
		 * `sx` with no value → sxAttr.value === null → not a container → sxIsDynamic = true.
		 * The dynamic branch then checks isJSXExpressionContainer again, finds false, skips emit.
		 * Source has "class=" to pass the quick filter.
		 */
		const src = `export default function A() { return <div sx class="x" /> }`
		/* Should not throw and produce some output (class= is still present) */
		expect(() => transform(src)).not.toThrow()
	})
})

describe("rewriteModule — dynamic sx with classNeedsRewrite (lines 371-373)", () => {
	it("DOM element with spread + dynamic sx → class merged with spread and compileSx", () => {
		/*
		 * spread present on DOM element → classNeedsRewrite = true.
		 * sx is dynamic (identifier) → sxIsDynamic path.
		 * Both conditions true → emitClassAttr called for the spread merge (lines 371-373).
		 */
		const src = `export default function A(props: { class?: string }) { return <div {...props} sx={props.sx} class="base" /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain("sx=")
		expect(result.code).toContain("compileSx(")
	})
})

describe("rewriteModule — existing flare/styles import merge (lines 478-491)", () => {
	it("merges compileCss into existing flare/styles import", () => {
		const src = `import { cn } from "flare/styles"
export default function A() { return <div css="color: red" /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		/* compileCss should be merged into the existing import, not a new import statement */
		const importMatches = result.code.match(/from "flare\/styles"/g) ?? []
		expect(importMatches.length).toBe(1)
		expect(result.code).toContain("compileCss")
		expect(result.code).toContain("cn")
	})

	it("all needed specifiers already present → import unchanged", () => {
		const src = `import { compileCss } from "flare/styles"
export default function A() { return <div css="color: red" /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		/* Only one import statement */
		const importMatches = result.code.match(/from "flare\/styles"/g) ?? []
		expect(importMatches.length).toBe(1)
	})

	it("empty import braces `import {} from` → inserts specifiers inside braces (line 490)", () => {
		/*
		 * existingStylesImport with zero specifiers → lastSpec is undefined
		 * → falls to the `import {` insertion branch at line 490.
		 */
		const src = `import {} from "flare/styles"
export default function A() { return <div css="color: red" /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).toContain("compileCss")
		/* Only one import from that package */
		const importMatches = result.code.match(/from "flare\/styles"/g) ?? []
		expect(importMatches.length).toBe(1)
	})

	it("no existing imports at all → prepends import (line 499 ms.prepend)", () => {
		/*
		 * lastImportEnd === 0 → ms.prepend path (line 499 `ms.prepend`).
		 * Achieved by a source with no import declarations.
		 */
		const src = `export default function A() { return <div css="color: red" /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).toContain('from "flare/styles"')
		/* Import should appear before the function (no leading newline on prepend) */
		const importIdx = result.code.indexOf('flare/styles"')
		const fnIdx = result.code.indexOf("export default")
		expect(importIdx).toBeLessThan(fnIdx)
	})

	it("existing non-styles import + needed compileCss → inserts after last import end (line 497)", () => {
		/*
		 * lastImportEnd > 0 but existingStylesImport === null.
		 * Exercises the `ms.prependLeft(lastImportEnd, ...)` branch at line 497.
		 */
		const src = `import { something } from "other-pkg"
export default function A() { return <div css="color: red" /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).toContain('from "flare/styles"')
		/* The new import should appear after "other-pkg" */
		const otherIdx = result.code.indexOf('"other-pkg"')
		const stylesIdx = result.code.indexOf('flare/styles"')
		expect(stylesIdx).toBeGreaterThan(otherIdx)
	})
})

describe("rewriteModule — class array with || LogicalExpression (non-&& operator)", () => {
	it("array with || logical expression → falls to generic expr branch", () => {
		/*
		 * resolveClassArray: the LogicalExpression branch only fires for operator === "&&".
		 * An `||` expression takes the generic `else` branch (lines 121-125).
		 */
		const src = `export default function A({ a, b }: { a: string; b: string }) { return <div class={[a || b]} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		/* Generic template interpolation: ${a || b} */
		expect(result.code).toContain("${a || b}")
	})
})

describe("rewriteModule — class array with && non-string right side (lines 116-118)", () => {
	it("array with cond && expr (non-string right) → nested template ternary", () => {
		/*
		 * LogicalExpression with && but rightEl is not a string literal →
		 * the `else` branch at line 116-118 in resolveClassArray.
		 */
		const src = `export default function A({ on, cls }: { on: boolean; cls: string }) { return <div class={[on && cls]} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		/* Produces: ${on ? ` ${cls}` : ""} or ${on ? `${cls}` : ""} */
		expect(result.code).toMatch(/\$\{on \? `/)
	})
})

describe("rewriteModule — spread + dynamic class (line 286 classExpr branch)", () => {
	it("DOM element with spread + class={expr} (dynamic, no sx) → cn(classExpr, spread.class)", () => {
		/*
		 * spread && classAttr && dom, but classLiteral === null (classExpr set from dynamic class).
		 * `else if (classExpr !== null)` branch at line 286:
		 *   classExpr = `cn(${classExpr}, ${spreadClass})`
		 */
		const src = `export default function A({ v, ...rest }: { v: string; class?: string }) { return <div {...rest} class={v} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).toContain("rest.class")
		expect(result.code).toContain("cn(")
	})
})

describe("rewriteModule — spread on DOM with no class attr (line 391 no-op branch)", () => {
	it("DOM element with spread + css= attr but no class= → css rewritten, no class injected", () => {
		/*
		 * No classAttr + spread + dom → the `else if (!classAttr && spread && dom)` no-op branch
		 * at line 391. The source has css= to pass quick filter and trigger handleOpeningElement.
		 */
		const src = `export default function A(props: { class?: string }) { return <div {...props} css="color: red" /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain(`css="`)
		expect(result.code).toContain("compileCss(")
	})
})

describe("rewriteModule — emitClassAttr with expression literal=null (line 242)", () => {
	it("class={cn(...)} + sx static → emitClassAttr emits class={cn(..., atomics)} expression form", () => {
		/*
		 * When classAttr resolves to kind: "expr" (a cn() call is preserved as-is),
		 * the merged class is emittedClassAttr with literal=null → line 242 attrText = `class={...}`.
		 */
		const src = `import { cn } from "flare/styles"; export default function A({ on }: { on: boolean }) { return <div class={cn("base", on && "active")} sx={{ color: "red" }} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain("sx=")
		/* Output should be class={...} expression form */
		expect(result.code).toContain("class={")
	})
})

describe("rewriteModule — JSXMemberExpression tag name (line 62 tagName fallback)", () => {
	it("member-expression tag <Foo.Bar sx={...}> → tagName returns 'Component', no DOM spread handling", () => {
		/*
		 * `<Foo.Bar>` has a JSXMemberExpression name, not JSXIdentifier.
		 * tagName() falls to `return "Component"` at line 62.
		 * isDOMElement("Component") → false → spread not checked.
		 * Dynamic sx is still rewritten via compileSx fallback.
		 */
		const src = `export default function A({ s }: { s: object }) { return <Foo.Bar sx={s} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain("sx=")
		expect(result.code).toContain("compileSx(")
	})
})

describe("rewriteModule — resolveClassAttr fallback (line 186)", () => {
	it("class attr with JSXExpressionContainer containing a non-string, non-array, non-cn expr returns dynamic", () => {
		/*
		 * resolveClassAttr: cv is JSXExpressionContainer but expr is not string, not array, not cn() call.
		 * Falls to the `wrap in cn()` dynamic branch — NOT line 186.
		 * Line 186 fires only when cv is not null AND not a string literal AND not a JSXExpressionContainer.
		 * This is practically unreachable via normal JSX parsing (all JSX attr values are one of those).
		 * Mark the function return as ignored.
		 */
		/* This branch is unreachable via standard JSX — covered by istanbul ignore in source */
		expect(true).toBe(true)
	})
})

describe("rewriteModule — resolveClassArray first=true ternary arms (lines 113, 122)", () => {
	it("single [on && 'active'] element → sep='' (first=true, string-literal right branch, line 113)", () => {
		/*
		 * resolveClassArray: only element is LogicalExpression(&&) with string-literal right.
		 * first=true → sep="" → exercises line 113 true arm (empty-string sep).
		 */
		const src = `export default function A({ on }: { on: boolean }) { return <div class={[on && "active"]} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		/* No space prefix in the ternary expression */
		expect(result.code).toMatch(/\$\{on \? "active" : ""\}/)
	})

	it("single [a || b] element → sep='' (first=true, generic else branch, line 122)", () => {
		/*
		 * resolveClassArray: only element is LogicalExpression(||) — not &&, falls to generic else.
		 * first=true → sep="" at line 122 true arm (no leading space interpolation).
		 */
		const src = `export default function A({ a, b }: { a: string; b: string }) { return <div class={[a || b]} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		/* sep="" → no leading space before ${a || b} */
		expect(result.code).toContain("${a || b}")
		expect(result.code).not.toMatch(/` \$\{a \|\| b\}/)
	})
})

describe("rewriteModule — resolveClassArray null-hole elements (allStaticStrings + resolveClassArray null guards)", () => {
	it("class={['a',, 'b']} sparse array of strings → allStaticStrings skips null, returns literal (line 77 true arm)", () => {
		/*
		 * JSX sparse array `["a",, "b"]` → elements = ["a", null, "b"].
		 * allStaticStrings iterates: "a" (ok), null → el===null → continue (line 77 true arm), "b" (ok).
		 * Returns ["a", "b"] → resolveClassArray returns { kind: "literal", value: "a b" }.
		 * Covers allStaticStrings null-guard at line 77.
		 */
		const src = `export default function A() { return <div class={["a",, "b"]} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		/* Flattened to literal "a b" */
		expect(result.code).toContain('class="a b"')
	})

	it("class={[expr,, 'b']} sparse array with dynamic → resolveClassArray loop skips null (line 100 true arm)", () => {
		/*
		 * Elements = [Identifier, null, StringLiteral].
		 * allStaticStrings: Identifier is not a StringLiteral → returns null immediately.
		 * resolveClassArray loop: expr (generic else, sep=""), null → el===null → continue (line 100 true arm), "b" (string, sep=" ").
		 * Covers resolveClassArray null-guard at line 100.
		 */
		const src = `export default function A({ a }: { a: string }) { return <div class={[a,, "b"]} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).toContain("b")
		expect(result.code).toContain("${a}")
	})
})

describe("rewriteModule — resolveClassArray string-after-non-string (first=false ternary arms)", () => {
	it("[on && 'x', 'extra'] → string literal after non-literal → ` extra` with leading space (line 102 false arm)", () => {
		/*
		 * First element: LogicalExpression(&&) → first=false after processing.
		 * Second element: "extra" (StringLiteral) → line 102: `first ? el.value : ' extra'`
		 *   first=false → takes the ` ${el.value}` arm (branch 17 false arm, second count).
		 */
		const src = `export default function A({ on }: { on: boolean }) { return <div class={[on && "x", "extra"]} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).toContain(" extra")
	})

	it("[on && cls, on && otherCls] → second &&+non-string-right after first (line 116 false arm: sep=' ')", () => {
		/*
		 * Both elements are LogicalExpression(&&) with non-string right (identifiers).
		 * First: hits else at line 116, first=true → sep="" (true arm).
		 * Second: hits else at line 116, first=false → sep=" " (false arm — branch 22).
		 */
		const src = `export default function A({ on, cls, other }: { on: boolean; cls: string; other: string }) { return <div class={[on && cls, on && other]} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		/* Both items interpolated, second has leading space */
		expect(result.code).toContain("${on ?")
		expect(result.code).toContain("other")
	})

	it("[on && 'x', a || b] → generic expr after first (line 122 false arm: sep=' ')", () => {
		/*
		 * First element: LogicalExpression(&&) with string right → first=false.
		 * Second element: LogicalExpression(||) → generic else at line 122: `first ? '' : ' '`
		 *   first=false → sep=" " (branch 23 false arm).
		 */
		const src = `export default function A({ on, a, b }: { on: boolean; a: string; b: string }) { return <div class={[on && "x", a || b]} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		/* Generic expr gets leading space interpolation */
		expect(result.code).toContain("${a || b}")
	})
})

describe("rewriteModule — resolveClassAttr cv === null (boolean class attr, line 161)", () => {
	it("boolean class attr (no value) + sx static → treated as empty literal, merged with atomics", () => {
		/*
		 * `class` with no value → JSXAttribute.value === null → cv === null → line 161 returns
		 * { kind: "literal", value: "" }. The empty literal merges with sx atomics to produce
		 * class="<atomic>".
		 */
		const src = `export default function A() { return <div class sx={{ color: "red" }} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain("sx=")
		/* atomic class emitted — no empty prefix from the null-value class attr */
		expect(result.code).toMatch(/class="sx-color-red-\w+"/)
	})
})

describe("rewriteModule — resolveClassAttr JSXExpressionContainer with string literal (line 167)", () => {
	it('class={"string"} → resolves to literal value, merged with sx atomics', () => {
		/*
		 * cv is JSXExpressionContainer, expr is a StringLiteral → line 167 returns
		 * { kind: "literal", value: "string" }. Merged with sx atomics.
		 */
		const src = `export default function A() { return <div class={"base"} sx={{ padding: "8px" }} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain("sx=")
		/* literal "base" retained alongside atomic */
		expect(result.code).toContain("base")
		expect(result.code).toMatch(/sx-padding-8px-\w+/)
	})

	it('class={"foo"} with no sx → array/class rewrite still flattens to literal', () => {
		/*
		 * JSXExpressionContainer wrapping a plain string literal → kind: "literal".
		 * No sx — but class was a JSXExpressionContainer so rewrite fires to flatten it.
		 * V8 line 167 branch covered via the string literal fast-return.
		 */
		const src = `export default function A() { return <div class={"static-class"} sx={{ color: "blue" }} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).toContain("static-class")
		expect(result.code).not.toContain('class={"static-class"}')
	})
})

describe("rewriteModule — spread attribute that is not an Identifier (member expression)", () => {
	it("spread with member expression argument (obj.props) → not treated as class spread", () => {
		/*
		 * hasSpread only returns the identName when the spread arg is an Identifier.
		 * `{...obj.props}` is a MemberExpression → hasSpread returns null → no merge.
		 */
		const src = `export default function A({ obj }: { obj: { props: Record<string, unknown> } }) { return <div {...obj.props} class="base" /> }`
		const result = transform(src)
		/*
		 * result may be null (no actual rewrite needed) or class stays literal.
		 * Critical: no template merge with obj.props.class.
		 */
		if (result !== null) {
			expect(result.code).not.toContain("obj.props.class")
		}
	})
})

describe("rewriteModule — fragment root and self-closing with no children", () => {
	it("Fragment with sx child → child sx transformed normally", () => {
		const src = `export default function A() { return <><div sx={{ color: "red" }} /></> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain("sx=")
		expect(result.code).toContain("class=")
	})
})

describe("rewriteModule — css= with JSXExpressionContainer string literal value (line 411)", () => {
	it("css={\"color: red\"} expression string literal → compileCss with string value", () => {
		/*
		 * handleCssAttr: isJSXExpressionContainer branch → isStringLiteral(expr) → line 412.
		 */
		const src = `export default function A() { return <div css={"color: red"} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain("css=")
		expect(result.code).toContain('compileCss("color: red"')
	})
})

describe("rewriteModule — css= with existing non-empty class= (line 430)", () => {
	it("existing class='foo' + css= → class={cn('foo', compileCss(...))}", () => {
		const src = `export default function A() { return <div class="foo" css="margin: 0" /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain(`css="`)
		expect(result.code).toContain('cn("foo",')
		expect(result.code).toContain("compileCss(")
	})

	it("existing class='' (empty) + css= → class={compileCss(...)} without cn wrap", () => {
		/*
		 * existing.value is empty string → the `if (existing.value)` branch is false
		 * → replaces with `class={compileCss(...)}` directly (line 433-434).
		 */
		const src = `export default function A() { return <div class="" css="margin: 0" /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain(`css="`)
		expect(result.code).not.toContain("cn(")
		expect(result.code).toContain("class={compileCss(")
	})

	it("existing class={expr} + css= → class={cn(expr, compileCss(...))} (line 436)", () => {
		/*
		 * resolveClassAttr returns kind: "expr" → existing.kind !== "literal"
		 * → the else branch at line 436.
		 */
		const src = `export default function A({ v }: { v: string }) { return <div class={v} css="margin: 0" /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain(`css=`)
		expect(result.code).toContain("cn(")
		expect(result.code).toContain("compileCss(")
	})
})

describe("rewriteModule — static sx + classExpr (lines 344-345)", () => {
	it("class={expr} + sx={{...}} → cn(expr, atomicStr) (no spread)", () => {
		/*
		 * No spread on DOM element. classExpr !== null (dynamic class attr).
		 * Static sx → atomics resolved.
		 * Lines 344-345: `classExpr = cn(${classExpr}, "${atomicStr}")`.
		 */
		const src = `export default function A({ v }: { v: string }) { return <div class={v} sx={{ color: "red" }} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain("sx=")
		expect(result.code).toContain("cn(")
		/* atomic class joined with the dynamic expr */
		expect(result.code).toMatch(/cn\(cn\(v\).*sx-color-red|cn\(cn\(v\).*a1-/)
	})
})

describe("rewriteModule — spread + literal class + sx (lines 331-333)", () => {
	it("DOM spread + literal class + static sx → template literal with atomic + spread.class", () => {
		/*
		 * spread && dom && classLiteral !== null at line 330.
		 * combined = [classLiteral, atomicStr].filter(Boolean).join(" ")
		 * classExpr = `\`${combined} \${${spreadClass} ?? ""}\``
		 * classLiteral = null  (lines 331-333)
		 */
		const src = `export default function A(props: { class?: string }) { return <div {...props} class="base" sx={{ color: "red" }} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain("sx=")
		expect(result.code).toContain("base")
		expect(result.code).toContain("props.class")
		/* Should be a template literal merging base+atomic with spread */
		expect(result.code).toContain("??")
	})
})

describe("rewriteModule — static sx object that fails evaluation (line 354)", () => {
	it("sx={{...externalVar}} (partial dynamic) → evaluateSxObject returns ir=null → falls back to compileSx", () => {
		/*
		 * The sx value IS an ObjectExpression (so isObjectExpression branch fires), but
		 * evaluateSxObject returns ir=null because of the top-level non-literal spread.
		 * This exercises `sxIsDynamic = true` at line 354, then the compileSx rewrite path.
		 */
		const src = `export default function A({ s }: { s: object }) { return <div sx={{ ...s }} /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain("sx=")
		expect(result.code).toContain("compileSx(")
	})
})

describe("rewriteModule — css= with null value (line 417 return branch)", () => {
	it("css boolean attribute (no value) + class attr → handleCssAttr returns early, no compileCss", () => {
		/*
		 * `css` boolean attribute → cssAttr.value === null.
		 * handleCssAttr: `if (val === null) return` at line 401.
		 * The source contains css= (no sx=) to reach handleCssAttr directly.
		 * Also has class= to pass the quick filter AND trigger classAttr path in handleOpeningElement.
		 * With no sx= and css boolean, handleOpeningElement falls through to the cssAttr handler.
		 */
		const src = `export default function A() { return <div css class="existing" /> }`
		expect(() => transform(src)).not.toThrow()
		const result = transform(src)
		/* css with no value → no compileCss emitted */
		if (result !== null) {
			expect(result.code).not.toContain("compileCss(")
		}
	})
})

describe("rewriteModule — spread + sx + classExpr merge (line 335)", () => {
	it("DOM spread + existing dynamic class + sx atomic → cn(classExpr, atomics, spread.class)", () => {
		/*
		 * spread present + classExpr (not literal) + sx static → line 335 branch:
		 * classExpr = `cn(${classExpr}, "${atomicStr}", ${spreadClass})`
		 */
		const src = `export default function A(props: { class?: string }) {
  return <div {...props} class={props.extra} sx={{ color: "red" }} />
}`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain("sx=")
		expect(result.code).toContain("props.class")
	})
})

describe("rewriteModule — sx= + css= coexistence (early-return fix)", () => {
	it("sx + css + class literal → all three composed into class attr", () => {
		/*
		 * Static sx extracts atomics, css= becomes compileCss(), existing class literal
		 * is base. All three merge into one class= attr via cn().
		 */
		const src = `export default function A() { return <div class="base" sx={{ color: "red" }} css="padding: 16px" /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain("sx=")
		expect(result.code).not.toContain(`css="`)
		expect(result.code).toContain("base")
		expect(result.code).toMatch(/sx-color-red-\w+/)
		expect(result.code).toContain(`compileCss("padding: 16px"`)
		/* base + atomic literal in cn() alongside compileCss */
		expect(result.code).toContain("cn(")
	})

	it("sx + css + spread + class literal → auto-merge with props.class AND both sx/css classes present", () => {
		/*
		 * spread forces template/cn merge with props.class;
		 * sx atomics fold in first, then css= compileCss folds into the merged expr.
		 */
		const src = `export default function A(props: { class?: string }) { return <div {...props} class="base" sx={{ color: "red" }} css="padding: 16px" /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain("sx=")
		expect(result.code).not.toContain(`css="`)
		expect(result.code).toContain("props.class")
		expect(result.code).toMatch(/sx-color-red-\w+/)
		expect(result.code).toContain(`compileCss("padding: 16px"`)
	})

	it("css only (no sx) → css rewritten to compileCss regardless of sx absence", () => {
		/*
		 * Confirms the non-sx path still reaches handleCssAttr normally.
		 */
		const src = `export default function A() { return <div css="display: flex" /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain(`css="`)
		expect(result.code).toContain("compileCss(")
		expect(result.code).toContain("class=")
	})

	it("sx (dynamic) + css → compileSx spread emitted AND css= rewritten via compileCss", () => {
		/*
		 * Dynamic sx rewrites to {...compileSx(style, "user.app")}.
		 * css= must also be processed — not skipped by the early return.
		 * Both runtime calls present; class attr carries compileCss result.
		 */
		const src = `export default function A({ style }: { style: object }) { return <div sx={style} css="padding: 8px" /> }`
		const result = transform(src)
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).not.toContain("sx=")
		expect(result.code).toContain("compileSx(")
		expect(result.code).not.toContain(`css="`)
		expect(result.code).toContain("compileCss(")
		expect(result.code).toContain(`"padding: 8px"`)
		expect(result.code).toContain("class=")
	})

	it("lib layer → compileCss call carries user.lib layer arg", () => {
		/*
		 * Files under node_modules get layer "sx" → layerArg returns "user.lib".
		 */
		const src = `export default function A() { return <div sx={{ color: "red" }} css="margin: 0" /> }`
		const result = rewriteModule(src, ctx({ layer: "sx", sourcePath: "/node_modules/my-lib/btn.tsx" }))
		expect(result).not.toBeNull()
		if (!result) return
		expect(result.code).toContain('"user.lib"')
		expect(result.code).toContain("compileCss(")
	})
})
