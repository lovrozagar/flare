/** @vitest-environment node */
import { describe, expect, it } from "vitest"
import {
	buildCriticalCss,
	collectAtomicClasses,
	type SxCssManifest,
} from "../../../src/ssr/critical-css.ts"

/* ── Fixtures ──────────────────────────────────────────────────────── */

const MANIFEST: SxCssManifest = {
	bundleHref: "/assets/flare-global-abc123.css",
	hashVersion: "a1",
	layerByRule: {
		"a1-abc12345": "sx",
		"a1-bbbb1111": "app",
		"a1-def67890": "app",
		"a1-ffff0000": "sx",
	},
	moduleManifest: {
		"/src/button.tsx": ["a1-abc12345", "a1-ffff0000"],
		"/src/card.tsx": ["a1-def67890", "a1-bbbb1111"],
	},
	rules: {
		"a1-abc12345": ".a1-abc12345 { color: red }",
		"a1-bbbb1111": ".a1-bbbb1111 { font-size: 16px }",
		"a1-def67890": ".a1-def67890 { margin: 0 }",
		"a1-ffff0000": ".a1-ffff0000 { padding: 8px }",
	},
	version: 1,
}

/* ── collectAtomicClasses ─────────────────────────────────────────── */

describe("collectAtomicClasses", () => {
	it("extracts prod-mode atomic class names from rendered HTML", () => {
		const html = `<div class="a1-abc12345 a1-def67890"><span class="a1-ffff0000"></span></div>`
		const classes = collectAtomicClasses(html)
		expect(classes).toContain("a1-abc12345")
		expect(classes).toContain("a1-def67890")
		expect(classes).toContain("a1-ffff0000")
	})

	it("ignores non-atomic class names", () => {
		const html = `<div class="btn primary a1-abc12345 some-class"></div>`
		const classes = collectAtomicClasses(html)
		expect(classes.has("btn")).toBe(false)
		expect(classes.has("primary")).toBe(false)
		expect(classes.has("some-class")).toBe(false)
		expect(classes.has("a1-abc12345")).toBe(true)
	})

	it("handles no class attributes", () => {
		const html = `<div id="foo"><span></span></div>`
		const classes = collectAtomicClasses(html)
		expect(classes.size).toBe(0)
	})

	it("deduplicates classes appearing multiple times", () => {
		const html = `<div class="a1-abc12345"></div><span class="a1-abc12345 a1-def67890"></span>`
		const classes = collectAtomicClasses(html)
		expect(classes.size).toBe(2)
		expect(classes.has("a1-abc12345")).toBe(true)
		expect(classes.has("a1-def67890")).toBe(true)
	})
})

/* ── buildCriticalCss — basic ─────────────────────────────────────── */

describe("buildCriticalCss — basic rule lookup", () => {
	it("returns CSS rules for classes found in rendered HTML", () => {
		const html = `<div class="a1-abc12345 a1-def67890"></div>`
		const result = buildCriticalCss(html, [], MANIFEST)

		expect(result.css).toContain(".a1-abc12345 { color: red }")
		expect(result.css).toContain(".a1-def67890 { margin: 0 }")
	})

	it("wraps lib-origin rules in @layer sx", () => {
		const html = `<div class="a1-abc12345"></div>`
		const result = buildCriticalCss(html, [], MANIFEST)
		/* a1-abc12345 is layerByRule "sx" */
		expect(result.css).toContain("@layer sx")
		expect(result.css).toMatch(/@layer sx\s*\{[^}]*\.a1-abc12345/)
	})

	it("wraps consumer-origin rules in @layer app", () => {
		const html = `<div class="a1-def67890"></div>`
		const result = buildCriticalCss(html, [], MANIFEST)
		/* a1-def67890 is layerByRule "app" */
		expect(result.css).toContain("@layer app")
		expect(result.css).toMatch(/@layer app\s*\{[^}]*\.a1-def67890/)
	})

	it("omits classes not present in manifest rules", () => {
		const html = `<div class="a1-unknown00"></div>`
		const result = buildCriticalCss(html, [], MANIFEST)
		expect(result.css).toBe("")
	})
})

/* ── buildCriticalCss — module-manifest union ─────────────────────── */

describe("buildCriticalCss — module-manifest union", () => {
	it("unions all classes from given module ids even if not in rendered HTML", () => {
		/* Rendered HTML only has a1-abc12345, but module /src/button.tsx
		 * maps to [a1-abc12345, a1-ffff0000]. Both should be in critical. */
		const html = `<div class="a1-abc12345"></div>`
		const renderedModules = ["/src/button.tsx"]
		const result = buildCriticalCss(html, renderedModules, MANIFEST)

		expect(result.css).toContain(".a1-abc12345 { color: red }")
		expect(result.css).toContain(".a1-ffff0000 { padding: 8px }")
	})

	it("covers Show/Switch branch classes not in initial render", () => {
		/* /src/card.tsx has a1-bbbb1111 — not rendered, but reachable */
		const html = `<div class="a1-def67890"></div>`
		const renderedModules = ["/src/card.tsx"]
		const result = buildCriticalCss(html, renderedModules, MANIFEST)

		expect(result.css).toContain(".a1-def67890 { margin: 0 }")
		expect(result.css).toContain(".a1-bbbb1111 { font-size: 16px }")
	})

	it("ignores unknown module ids gracefully", () => {
		const html = `<div class="a1-abc12345"></div>`
		const renderedModules = ["/src/nonexistent.tsx"]
		const result = buildCriticalCss(html, renderedModules, MANIFEST)
		/* Only class from HTML is in result */
		expect(result.css).toContain(".a1-abc12345 { color: red }")
		expect(result.css).not.toContain(".a1-ffff0000")
	})

	it("deduplicates when HTML class and module-manifest overlap", () => {
		const html = `<div class="a1-abc12345"></div>`
		const renderedModules = ["/src/button.tsx"] /* also maps to a1-abc12345 */
		const result = buildCriticalCss(html, renderedModules, MANIFEST)
		/* a1-abc12345 rule appears exactly once */
		const count = (result.css.match(/\.a1-abc12345/g) ?? []).length
		expect(count).toBe(1)
	})
})

/* ── buildCriticalCss — missing manifest ─────────────────────────── */

describe("buildCriticalCss — no manifest", () => {
	it("returns empty string when manifest is undefined", () => {
		const result = buildCriticalCss(`<div class="a1-abc12345"></div>`, [], undefined)
		expect(result.css).toBe("")
		expect(result.bundleHref).toBeUndefined()
	})

	it("returns bundleHref from manifest", () => {
		const html = `<div class="a1-abc12345"></div>`
		const result = buildCriticalCss(html, [], MANIFEST)
		expect(result.bundleHref).toBe("/assets/flare-global-abc123.css")
	})
})

/* ── buildCriticalCss — layer grouping ───────────────────────────── */

describe("buildCriticalCss — combined layer output", () => {
	it("emits both @layer sx and @layer app when both present", () => {
		/* a1-abc12345 → sx; a1-def67890 → app */
		const html = `<div class="a1-abc12345 a1-def67890"></div>`
		const result = buildCriticalCss(html, [], MANIFEST)

		expect(result.css).toContain("@layer sx")
		expect(result.css).toContain("@layer app")
	})

	it("emits only @layer sx when only lib rules present", () => {
		const html = `<div class="a1-abc12345 a1-ffff0000"></div>`
		const result = buildCriticalCss(html, [], MANIFEST)

		expect(result.css).toContain("@layer sx")
		expect(result.css).not.toContain("@layer app")
	})

	it("emits only @layer app when only app rules present", () => {
		const html = `<div class="a1-def67890 a1-bbbb1111"></div>`
		const result = buildCriticalCss(html, [], MANIFEST)

		expect(result.css).not.toContain("@layer sx")
		expect(result.css).toContain("@layer app")
	})

	it("returns empty string when no matching classes", () => {
		const html = `<div class="unrelated-class"></div>`
		const result = buildCriticalCss(html, [], MANIFEST)
		expect(result.css).toBe("")
	})
})

/* ── injectCriticalCss (HTML buffer mutation) ─────────────────────── */

/* ── collectAtomicClasses — raw Tailwind tokens (Bug 1 fix) ──────── */

describe("collectAtomicClasses — manifest-keyed raw class tokens", () => {
	const RAW_MANIFEST: SxCssManifest = {
		bundleHref: "/assets/flare-global.css",
		hashVersion: "a1",
		layerByRule: { "bg-accent": "app", "text-sm": "app", flex: "app" },
		moduleManifest: {},
		rules: {
			"bg-accent": ".bg-accent { background-color: var(--color-accent) }",
			flex: ".flex { display: flex }",
			"text-sm": ".text-sm { font-size: 0.875rem }",
		},
		version: 1,
	}

	it("picks up raw Tailwind tokens present as manifest keys", () => {
		const html = `<div class="flex bg-accent"><span class="text-sm"></span></div>`
		const classes = collectAtomicClasses(html, RAW_MANIFEST)
		expect(classes.has("bg-accent")).toBe(true)
		expect(classes.has("text-sm")).toBe(true)
		expect(classes.has("flex")).toBe(true)
	})

	it("filters out tokens not in manifest even when class= is present", () => {
		const html = `<div class="flex bg-accent some-random-class font-bold"></div>`
		const classes = collectAtomicClasses(html, RAW_MANIFEST)
		expect(classes.has("flex")).toBe(true)
		expect(classes.has("bg-accent")).toBe(true)
		/* not in manifest.rules — excluded */
		expect(classes.has("some-random-class")).toBe(false)
		expect(classes.has("font-bold")).toBe(false)
	})

	it("buildCriticalCss returns rules for raw Tailwind token classes", () => {
		const html = `<div class="flex bg-accent"></div>`
		const result = buildCriticalCss(html, [], RAW_MANIFEST)
		expect(result.css).toContain(".bg-accent { background-color: var(--color-accent) }")
		expect(result.css).toContain(".flex { display: flex }")
	})

	it("collectAtomicClasses without manifest falls back to pattern matching only", () => {
		const html = `<div class="flex bg-accent a1-abc12345"></div>`
		const classes = collectAtomicClasses(html)
		/* Without manifest, raw tokens are not matched — only hash/sx- patterns */
		expect(classes.has("a1-abc12345")).toBe(true)
		expect(classes.has("flex")).toBe(false)
		expect(classes.has("bg-accent")).toBe(false)
	})
})

/* ── collectAtomicClasses — dev-mode sx- prefix ───────────────────── */

describe("collectAtomicClasses — dev-mode class names", () => {
	it("extracts dev-mode sx- prefixed classes from HTML", () => {
		const html = `<div class="sx-color-red-ab12 sx-padding-16px-cd34"></div>`
		const classes = collectAtomicClasses(html)
		expect(classes.has("sx-color-red-ab12")).toBe(true)
		expect(classes.has("sx-padding-16px-cd34")).toBe(true)
	})

	it("mixes prod and dev atomic classes in same HTML", () => {
		const html = `<div class="a1-abc12345 sx-margin-0-ef56"></div>`
		const classes = collectAtomicClasses(html)
		expect(classes.has("a1-abc12345")).toBe(true)
		expect(classes.has("sx-margin-0-ef56")).toBe(true)
	})
})

/* ── buildCriticalCss — layerByRule ?? "app" fallback (lines 70-72) ── */

describe("buildCriticalCss — layerByRule fallback", () => {
	it("class in rules but missing from layerByRule → defaults to app layer (line 72 ?? branch)", () => {
		/*
		 * The `manifest.layerByRule[cls] ?? "app"` branch at line 72.
		 * A class present in rules but absent from layerByRule should land in @layer app.
		 */
		const manifest: SxCssManifest = {
			bundleHref: "/assets/flare-global.css",
			hashVersion: "a1",
			layerByRule: {},
			moduleManifest: {},
			rules: { "a1-orphan00": ".a1-orphan00 { display: flex }" },
			version: 1,
		}
		const html = `<div class="a1-orphan00"></div>`
		const result = buildCriticalCss(html, [], manifest)
		expect(result.css).toContain(".a1-orphan00 { display: flex }")
		expect(result.css).toContain("@layer app")
		expect(result.css).not.toContain("@layer sx")
	})

	it("class present in HTML but absent from manifest.rules → skipped (line 70 !rule continue)", () => {
		/*
		 * `if (!rule) continue` at line 70.
		 * The class passes isAtomicClass but has no entry in manifest.rules.
		 */
		const manifest: SxCssManifest = {
			bundleHref: "/assets/flare-global.css",
			hashVersion: "a1",
			layerByRule: {},
			moduleManifest: {},
			rules: {},
			version: 1,
		}
		const html = `<div class="a1-abc12345"></div>`
		const result = buildCriticalCss(html, [], manifest)
		expect(result.css).toBe("")
		expect(result.bundleHref).toBe("/assets/flare-global.css")
	})
})

import { injectCriticalPlaceholder, injectCriticalAppend } from "../../../src/ssr/critical-css.ts"

describe("injectCriticalPlaceholder", () => {
	it("injects empty style placeholder before </head>", () => {
		const html = `<html><head><title>Test</title></head><body></body></html>`
		const result = injectCriticalPlaceholder(html, "test-nonce")
		expect(result).toContain(`<style id="flare-critical" nonce="test-nonce"></style>`)
		expect(result.indexOf(`<style id="flare-critical"`)).toBeLessThan(result.indexOf("</head>"))
	})

	it("omits nonce attr when nonce is empty", () => {
		const html = `<html><head></head><body></body></html>`
		const result = injectCriticalPlaceholder(html, "")
		expect(result).toContain(`<style id="flare-critical"></style>`)
		expect(result).not.toContain("nonce=")
	})

	it("also injects preload link with bundleHref", () => {
		const html = `<html><head></head><body></body></html>`
		const result = injectCriticalPlaceholder(html, "nonce-abc", "/assets/flare-global-xyz.css")
		expect(result).toContain(`rel="preload"`)
		expect(result).toContain(`href="/assets/flare-global-xyz.css"`)
		expect(result).toContain(`as="style"`)
		expect(result).toContain(`onload="this.rel='stylesheet'"`)
	})

	it("omits preload when bundleHref is undefined", () => {
		const html = `<html><head></head><body></body></html>`
		const result = injectCriticalPlaceholder(html, "nonce-abc", undefined)
		expect(result).not.toContain(`rel="preload"`)
	})

	it("returns buffer unchanged if no </head> found", () => {
		const html = `<html><body></body></html>`
		const result = injectCriticalPlaceholder(html, "nonce")
		expect(result).toBe(html)
	})
})

describe("injectCriticalAppend", () => {
	it("injects computed critical CSS before </body>", () => {
		const html = `<html><head></head><body><div class="a1-abc12345"></div></body></html>`
		const renderedModules: string[] = []
		const result = injectCriticalAppend(html, renderedModules, MANIFEST, "my-nonce")
		expect(result).toContain(`<style`)
		expect(result).toContain(`data-flare-critical-append`)
		expect(result).toContain(".a1-abc12345 { color: red }")
		expect(result.indexOf(`<style`)).toBeLessThan(result.indexOf("</body>"))
	})

	it("omits style tag when critical CSS is empty", () => {
		const html = `<html><head></head><body><div class="no-match"></div></body></html>`
		const result = injectCriticalAppend(html, [], MANIFEST, "nonce")
		expect(result).not.toContain("data-flare-critical-append")
	})

	it("skips injection entirely when manifest is undefined", () => {
		const html = `<html><head></head><body><div class="a1-abc12345"></div></body></html>`
		const result = injectCriticalAppend(html, [], undefined, "nonce")
		expect(result).toBe(html)
	})

	it("nonce attr present when nonce provided", () => {
		const html = `<html><head></head><body><div class="a1-abc12345"></div></body></html>`
		const result = injectCriticalAppend(html, [], MANIFEST, "xyz-nonce")
		expect(result).toContain(`nonce="xyz-nonce"`)
	})

	it("nonce attr omitted when nonce is empty", () => {
		const html = `<html><head></head><body><div class="a1-abc12345"></div></body></html>`
		const result = injectCriticalAppend(html, [], MANIFEST, "")
		const styleMatch = result.match(/<style[^>]*data-flare-critical-append[^>]*>/)
		expect(styleMatch?.[0]).not.toContain("nonce=")
	})
})
