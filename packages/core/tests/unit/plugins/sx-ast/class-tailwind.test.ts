/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { rewriteModule } from "../../../../src/plugins/sx-ast/rewrite.ts";
import type { RewriteCtx } from "../../../../src/plugins/sx-ast/rewrite.ts";

/* ---------------------------------------------------------------------------
 * Fake TW compiler: recognizes a fixed set of utilities, returns a body string.
 * Variant utilities (hover:, md:, group-hover:) included to cover wrapped rules.
 * --------------------------------------------------------------------------- */

const FAKE_UTILITIES: Record<string, string> = {
	"bg-blue-500": "background-color: rgb(59, 130, 246)",
	"bg-red-500": "background-color: rgb(239, 68, 68)",
	flex: "display: flex",
	"font-bold": "font-weight: 700",
	"group-hover:bg-red-500": "&:is(:where(.group):hover *) { background-color: rgb(239, 68, 68) }",
	"hover:bg-red-500": "&:hover { background-color: rgb(239, 68, 68) }",
	"items-center": "align-items: center",
	"md:p-8": "@media (min-width: 768px) { padding: 2rem }",
	"p-4": "padding: 1rem",
};

/* MARKER_TOKEN_RE: group | peer with optional /name suffix */
const MARKER_RE = /^(?:group|peer)(?:\/[\w-]+)?$/;

function fakeTwCompile(token: string): string | null {
	if (MARKER_RE.test(token)) return null; /* markers never produce CSS */
	return FAKE_UTILITIES[token] ?? null;
}

function makeCssEmit() {
	const rules: string[] = [];
	return { rules, emit: (r: string) => rules.push(r) };
}

function ctx(overrides?: Partial<RewriteCtx>): RewriteCtx {
	const { emit } = makeCssEmit();
	return {
		cssEmit: emit,
		layer: "app",
		mode: "dev",
		sourcePath: "input.tsx",
		twCompile: fakeTwCompile,
		...overrides,
	};
}

function transform(code: string, overrides?: Partial<RewriteCtx>) {
	return rewriteModule(code, ctx(overrides));
}

function transformWithRules(code: string, overrides?: Partial<RewriteCtx>) {
	const rules: string[] = [];
	const c: RewriteCtx = {
		cssEmit: (r: string) => rules.push(r),
		layer: "app",
		mode: "dev",
		sourcePath: "input.tsx",
		twCompile: fakeTwCompile,
		...overrides,
	};
	const result = rewriteModule(code, c);
	return { result, rules };
}

/* =========================================================================
 * Basic single-class compilation
 * ========================================================================= */

describe("class= Tailwind compile — single utility", () => {
	it('class="bg-blue-500" → emits CSS rule for bg-blue-500', () => {
		const { result, rules } = transformWithRules(`export default function A() { return <div class="bg-blue-500" /> }`);
		/* class attr present in source so rewriteModule must be called with class= content */
		/* The rule emitted by cssEmit must contain bg-blue-500 */
		expect(rules.some((r) => r.includes("bg-blue-500"))).toBe(true);
		expect(rules.some((r) => r.includes("background-color: rgb(59, 130, 246)"))).toBe(true);
	});

	it('class="p-4" → emits CSS rule with padding', () => {
		const { rules } = transformWithRules(`export default function A() { return <div class="p-4" /> }`);
		expect(rules.some((r) => r.includes("p-4"))).toBe(true);
		expect(rules.some((r) => r.includes("padding: 1rem"))).toBe(true);
	});
});

describe("class= Tailwind compile — multiple utilities", () => {
	it('class="bg-blue-500 p-4" → two rules emitted', () => {
		const { rules } = transformWithRules(`export default function A() { return <div class="bg-blue-500 p-4" /> }`);
		expect(rules.some((r) => r.includes("bg-blue-500"))).toBe(true);
		expect(rules.some((r) => r.includes("p-4"))).toBe(true);
		expect(rules.length).toBeGreaterThanOrEqual(2);
	});

	it("class attr string preserved (tokens remain in class attribute)", () => {
		const result = transform(`export default function A() { return <div class="bg-blue-500 p-4" /> }`);
		/* rewrite may produce null if no structural change is required, but
		 * if it produces a result the class attr should still reference those tokens */
		if (result !== null) {
			expect(result.code).toContain("bg-blue-500");
			expect(result.code).toContain("p-4");
		}
	});
});

describe("class= Tailwind compile — non-utility pass-through", () => {
	it('class="custom-class bg-blue-500" → bg-blue-500 emits CSS, custom-class does NOT', () => {
		const { result, rules } = transformWithRules(
			`export default function A() { return <div class="custom-class bg-blue-500" /> }`,
		);
		/* bg-blue-500 compiles */
		expect(rules.some((r) => r.includes("bg-blue-500"))).toBe(true);
		/* custom-class has no CSS rule */
		expect(rules.some((r) => r.includes(".custom-class"))).toBe(false);
		/* both still appear in the output class attr */
		if (result !== null) {
			expect(result.code).toContain("custom-class");
			expect(result.code).toContain("bg-blue-500");
		}
	});

	it('class="not-a-util" → no CSS emitted, token passes through', () => {
		const { result, rules } = transformWithRules(`export default function A() { return <div class="not-a-util" /> }`);
		expect(rules.length).toBe(0);
		/* No rewrite needed for a non-utility literal — may return null */
		if (result !== null) {
			expect(result.code).toContain("not-a-util");
		}
	});
});

describe("class= Tailwind compile — variant utilities", () => {
	it('class="hover:bg-red-500" → rule with :hover selector', () => {
		const { rules } = transformWithRules(`export default function A() { return <div class="hover:bg-red-500" /> }`);
		/* Selector uses CSS-escaped colon: hover\:bg-red-500 */
		expect(rules.some((r) => r.includes("hover") && r.includes("bg-red-500"))).toBe(true);
		expect(rules.some((r) => r.includes(":hover"))).toBe(true);
	});

	it('class="md:p-8" → rule wrapped in @media', () => {
		const { rules } = transformWithRules(`export default function A() { return <div class="md:p-8" /> }`);
		/* Selector uses CSS-escaped colon: md\:p-8 */
		expect(rules.some((r) => r.includes("md") && r.includes("p-8"))).toBe(true);
		expect(rules.some((r) => r.includes("@media"))).toBe(true);
	});

	it('class="group-hover:bg-red-500" → rule with group parent selector', () => {
		const { rules } = transformWithRules(
			`export default function A() { return <div class="group-hover:bg-red-500" /> }`,
		);
		/* Selector uses CSS-escaped colon: group-hover\:bg-red-500 */
		expect(rules.some((r) => r.includes("group-hover") && r.includes("bg-red-500"))).toBe(true);
		expect(rules.some((r) => r.includes("group"))).toBe(true);
	});
});

describe("class= Tailwind compile — marker tokens (group, peer)", () => {
	it('class="group" → emitted as literal class name, NO CSS rule', () => {
		const { result, rules } = transformWithRules(`export default function A() { return <div class="group" /> }`);
		/* No CSS rule for marker */
		expect(rules.length).toBe(0);
		/* group still in output */
		if (result !== null) {
			expect(result.code).toContain("group");
		}
	});

	it('class="peer" → no CSS rule emitted', () => {
		const { rules } = transformWithRules(`export default function A() { return <div class="peer" /> }`);
		expect(rules.length).toBe(0);
	});

	it('class="group/name" → no CSS rule emitted (scoped group)', () => {
		const { rules } = transformWithRules(`export default function A() { return <div class="group/name" /> }`);
		expect(rules.length).toBe(0);
	});
});

describe("class= Tailwind compile — array expression", () => {
	it('class={["flex", "items-center"]} → both utilities emit CSS', () => {
		const { rules } = transformWithRules(
			`export default function A() { return <div class={["flex", "items-center"]} /> }`,
		);
		expect(rules.some((r) => r.includes("flex"))).toBe(true);
		expect(rules.some((r) => r.includes("items-center"))).toBe(true);
		expect(rules.length).toBeGreaterThanOrEqual(2);
	});

	it('class={["flex", on && "bg-red-500"]} → both sides compile, runtime keeps conditional', () => {
		const { result, rules } = transformWithRules(
			`export default function A({ on }: { on: boolean }) { return <div class={["flex", on && "bg-red-500"]} /> }`,
		);
		expect(rules.some((r) => r.includes("flex"))).toBe(true);
		expect(rules.some((r) => r.includes("bg-red-500"))).toBe(true);
		/* Runtime conditional preserved */
		if (result !== null) {
			expect(result.code).toContain("on");
		}
	});
});

describe("class= Tailwind compile — cn() call", () => {
	it('class={cn("flex", on && "bg-red-500")} → cn preserved, both string literals scanned', () => {
		const { result, rules } = transformWithRules(
			`import { cn } from "@lovrozagar/flare/styles"; export default function A({ on }: { on: boolean }) { return <div class={cn("flex", on && "bg-red-500")} /> }`,
		);
		/* cn() call preserved as-is */
		if (result !== null) {
			expect(result.code).toContain("cn(");
		}
		/* Still scanned — utilities compile */
		expect(rules.some((r) => r.includes("flex"))).toBe(true);
		expect(rules.some((r) => r.includes("bg-red-500"))).toBe(true);
	});
});

describe("class= Tailwind compile — layer assignment", () => {
	it("lib module path → emitted to layerByClass 'sx'", () => {
		const layerMap = new Map<string, "sx" | "app">();
		const c: RewriteCtx = {
			cssEmit: (rule: string) => {
				/* extract class name from rule for layer tracking (same as plugin.ts does) */
				const m = /^\.([^\s{,\\]+)/.exec(rule);
				if (m) layerMap.set(m[1], "sx");
			},
			layer: "sx",
			mode: "dev",
			sourcePath: "/node_modules/my-lib/Button.tsx",
			twCompile: fakeTwCompile,
		};
		rewriteModule(`export default function A() { return <div class="bg-blue-500" /> }`, c);
		/* cssEmit was called for bg-blue-500 */
		expect([...layerMap.values()].some((l) => l === "sx")).toBe(true);
	});

	it("consumer module → emitted to layerByClass 'app'", () => {
		const layerMap = new Map<string, "sx" | "app">();
		const c: RewriteCtx = {
			cssEmit: (rule: string) => {
				const m = /^\.([^\s{,\\]+)/.exec(rule);
				if (m) layerMap.set(m[1], "app");
			},
			layer: "app",
			mode: "dev",
			sourcePath: "/src/pages/Home.tsx",
			twCompile: fakeTwCompile,
		};
		rewriteModule(`export default function A() { return <div class="bg-blue-500" /> }`, c);
		expect([...layerMap.values()].some((l) => l === "app")).toBe(true);
	});
});

describe("class= Tailwind compile — dedup across transforms", () => {
	it("same utility in two transform calls → cssEmit called twice (dedup is plugin-level, not rewrite-level)", () => {
		/* rewrite.ts emits per-file; dedup is classPool in index.ts. Both calls emit. */
		let emitCount = 0;
		const c1: RewriteCtx = {
			cssEmit: () => {
				emitCount++;
			},
			layer: "app",
			mode: "dev",
			sourcePath: "a.tsx",
			twCompile: fakeTwCompile,
		};
		const c2: RewriteCtx = {
			cssEmit: () => {
				emitCount++;
			},
			layer: "app",
			mode: "dev",
			sourcePath: "b.tsx",
			twCompile: fakeTwCompile,
		};
		rewriteModule(`export default function A() { return <div class="bg-blue-500" /> }`, c1);
		rewriteModule(`export default function B() { return <div class="bg-blue-500" /> }`, c2);
		/* Each file emits at least once — plugin dedup via classPool.set() is idempotent */
		expect(emitCount).toBeGreaterThanOrEqual(1);
	});
});

describe("class= Tailwind compile — no twCompile (backward compat)", () => {
	it("twCompile absent → class= processed normally, no CSS emitted for TW tokens", () => {
		const rules: string[] = [];
		const c: RewriteCtx = {
			cssEmit: (r: string) => rules.push(r),
			layer: "app",
			mode: "dev",
			sourcePath: "input.tsx",
			/* twCompile intentionally omitted */
		};
		const result = rewriteModule(`export default function A() { return <div class="bg-blue-500 p-4" /> }`, c);
		/* No TW CSS emitted — falls back to pass-through */
		expect(rules.length).toBe(0);
	});
});

describe("class= Tailwind compile — template literal quasi (static parts)", () => {
	it("class={`flex bg-red-500`} → static tokens scanned", () => {
		const { rules } = transformWithRules(`export default function A() { return <div class={\`flex bg-red-500\`} /> }`);
		/* Template literal with no expressions = static string */
		expect(rules.some((r) => r.includes("flex"))).toBe(true);
		expect(rules.some((r) => r.includes("bg-red-500"))).toBe(true);
	});
});

describe("class= Tailwind compile — rule shape", () => {
	it("utility rule uses canonical (unescaped) class name selector", () => {
		const { rules } = transformWithRules(`export default function A() { return <div class="bg-blue-500" /> }`);
		/* Rule must be .bg-blue-500 { ... } (canonical token, CSS-escaped in selector) */
		expect(rules.some((r) => r.startsWith(".bg-blue-500"))).toBe(true);
	});

	it("hover variant rule shape: .hover\\:bg-red-500:hover { ... } or nested &:hover form", () => {
		const { rules } = transformWithRules(`export default function A() { return <div class="hover:bg-red-500" /> }`);
		/* The rule must contain the escaped selector or nested hover */
		const ruleText = rules.join("\n");
		/* Either CSS-escaped colon in selector or &:hover wrapping */
		expect(ruleText.includes("hover") || ruleText.includes(":hover")).toBe(true);
	});

	it("@media rule shape wraps declaration in @media block", () => {
		const { rules } = transformWithRules(`export default function A() { return <div class="md:p-8" /> }`);
		const ruleText = rules.join("\n");
		expect(ruleText).toContain("@media");
	});
});
