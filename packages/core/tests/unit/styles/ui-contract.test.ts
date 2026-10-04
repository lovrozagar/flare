/** @vitest-environment node */
/*
 * Contract the @repo/frontend-ui design system builds on. These pass against current Flare and
 * pin behavior: a change here must be deliberate, because consumer apps depend on every line.
 */
import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";

const ROOT = fileURLToPath(new URL("../../fixtures/ui-contract-app/", import.meta.url));

let css = "";
let js = "";

/** Whitespace-normalized rule body for an escaped selector, or null when no rule exists. */
function rule(selector: string): string | null {
	const at = css.indexOf(`${selector} {`);
	if (at === -1) return null;
	const end = css.indexOf("}", at);
	return css.slice(at, end + 1);
}

beforeAll(async () => {
	const dist = join(ROOT, "dist");
	await rm(dist, { recursive: true, force: true });
	try {
		await build({ configFile: join(ROOT, "vite.config.ts"), logLevel: "silent", root: ROOT });
		const files = (await readdir(join(dist, "client"), { recursive: true })).map(String);
		const sheets = files.filter((name) => name.endsWith(".css"));
		const scripts = files.filter((name) => name.endsWith(".js"));
		js = (await Promise.all(scripts.map((name) => readFile(join(dist, "client", name), "utf8")))).join("\n");
		expect(sheets).toEqual(["assets/flare-global.css"]);
		css = (await readFile(join(dist, "client", sheets[0] as string), "utf8")).replace(/\s+/g, " ");
	} finally {
		await rm(dist, { recursive: true, force: true });
	}
}, 180_000);

describe("ui contract: one global stylesheet, layered", () => {
	it("declares the layer order with app rules after library rules", () => {
		expect(css).toContain("@layer reset, sx, app, user.lib, user.app, inline;");
		const app = css.indexOf("@layer app {");
		expect(app).toBeGreaterThan(-1);
		expect(css.indexOf(".bg-canvas {")).toBeGreaterThan(app);
	});
});

describe("ui contract: tokens", () => {
	it("inlines a semantic -> scale chain down to the light-dark() value", () => {
		expect(rule(".bg-canvas")).toBe(".bg-canvas { background-color: light-dark(#f9f9fb, #18191b); }");
		expect(rule(".text-fg")).toBe(".text-fg { color: light-dark(#1c2024, #edeef0); }");
		expect(rule(".border-line")).toBe(".border-line { border-color: light-dark(#0009321f, #d9edfe25); }");
	});

	it("keeps light-dark() inside opacity modifiers", () => {
		const surface80 = rule(".bg-surface\\/80");
		expect(surface80).toContain("color-mix(");
		expect(surface80).toContain("light-dark(#fcfcfd, #111113)");
	});

	it("emits nothing for reset palette utilities or wrong-role tokens", () => {
		expect(rule(".bg-blue-500")).toBeNull();
		expect(rule(".text-surface")).toBeNull();
	});
});

describe("ui contract: direction, scheme, state variants", () => {
	it("compiles logical spacing", () => {
		expect(rule(".ms-2")).toBe(".ms-2 { margin-inline-start: calc(0.25rem * 2); }");
	});

	it("compiles boolean aria variants (flattened by Tailwind 4.3.3+)", () => {
		expect(rule('.aria-pressed\\:bg-canvas[aria-pressed="true"]')).toBe(
			'.aria-pressed\\:bg-canvas[aria-pressed="true"] { background-color: light-dark(#f9f9fb, #18191b); }',
		);
	});

	it("compiles rtl:, scheme-dark and data-[x]: variants", () => {
		expect(css).toContain('.rtl\\:-scale-x-100:where(:dir(rtl), [dir="rtl"], [dir="rtl"] *) {');
		expect(rule(".scheme-dark")).toBe(".scheme-dark { color-scheme: dark; }");
		expect(rule(".data-\\[popup-open\\]\\:bg-surface[data-popup-open]")).toBe(
			".data-\\[popup-open\\]\\:bg-surface[data-popup-open] { background-color: light-dark(#fcfcfd, #111113); }",
		);
	});
});

describe("ui contract: utilities that style children", () => {
	/* space-*, divide-* and the `*:` variants put the class inside :where()/:is(). */
	it("compiles them as a rule nested on the utility, with Tailwind's own selector", () => {
		expect(css).toMatch(/\.-space-x-2 \{ :where\(& > :not\(:last-child\)\) \{ [^}]*margin-inline-start:/);
		expect(css).toMatch(/\.divide-y \{ :where\(& > :not\(:last-child\)\) \{ [^}]*border-bottom-width:/);
		expect(css).toContain(".\\*\\:p-2 { :is(& > *) { padding: calc(0.25rem * 2); } }");
		expect(css).toMatch(
			/\.\\\*\\:data-\\\[slot\\=avatar\\\]\\:ring-2 \{ :is\(& > \*\)\[data-slot="avatar"\] \{ --tw-ring-shadow:/,
		);
	});
});

describe("ui contract: which class literals compile", () => {
	it("compiles literals in cn() args, && right arms and ternary branches", () => {
		for (const cls of [".p-4", ".gap-3", ".px-5", ".py-6"]) expect(rule(cls), cls).not.toBeNull();
	});

	it("does not compile module-const variant maps or class functions (documented limitation)", () => {
		expect(rule(".mt-7")).toBeNull();
		expect(rule(".mb-9")).toBeNull();
	});
});

describe("ui contract: Tailwind local variables stay live", () => {
	it("composes shadow and ring on one element through --tw-* vars", () => {
		expect(rule(".ring-1")).toContain("var(--tw-shadow)");
		expect(rule(".shadow-raised")).toContain("var(--tw-ring-shadow)");
		expect(rule(".shadow-raised")).toContain("light-dark(#0000001a, #00000080)");
	});

	it("ships the @property rules and the properties fallback layer first", () => {
		expect(css).toContain('@property --tw-shadow { syntax: "*"; inherits: false; initial-value: 0 0 #0000; }');
		expect(css.startsWith("@layer properties;")).toBe(true);
		expect(css).toMatch(
			/@layer properties \{ @supports .*\*, ::before, ::after, ::backdrop \{[^}]*--tw-shadow: 0 0 #0000;/,
		);
	});
});

describe("ui contract: theme entry loads Tailwind plugins", () => {
	it("compiles a utility added by an @plugin in the theme", () => {
		expect(rule(".fixture-contract")).toBe(".fixture-contract { color: #0c0ffe; }");
	});
});

describe("ui contract: compile-time merge uses the app theme", () => {
	it("collapses a static custom-radius conflict to the last utility", () => {
		/* Solid templates may drop quotes around single-token attribute values. */
		expect(js).toMatch(/class=("?)rounded-lg\1[\s>]/);
		expect(js).not.toContain("rounded-control rounded-lg");
		expect(rule(".rounded-lg")).not.toBeNull();
	});
});
