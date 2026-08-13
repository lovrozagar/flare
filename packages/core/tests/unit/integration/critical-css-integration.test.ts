/** @vitest-environment node */
import { describe, expect, it } from "vitest"
import {
	buildCriticalCss,
	collectAtomicClasses,
	injectCriticalAppend,
	injectCriticalPlaceholder,
	CRITICAL_SHEET_ID,
	type SxCssManifest,
} from "../../../src/ssr/critical-css.ts"

/* ── Fixture manifest ─────────────────────────────────────────────── */

/* Prod-format class names: a1- + exactly 8 base-36 chars (matches PROD_CLASS_RE) */
const MANIFEST: SxCssManifest = {
	bundleHref: "/assets/flare-global-abc123.css",
	hashVersion: "a1",
	layerByRule: {
		"a1-aa000001": "sx",
		"a1-bb000002": "app",
		"a1-cc000003": "app",
		"a1-dd000004": "sx",
		"a1-ee000005": "app",
	},
	moduleManifest: {
		"/src/button.tsx": ["a1-aa000001", "a1-dd000004"],
		"/src/card.tsx": ["a1-bb000002", "a1-cc000003"],
		"/src/layout.tsx": ["a1-ee000005"],
	},
	rules: {
		"a1-aa000001": ".a1-aa000001 { color: red }",
		"a1-bb000002": ".a1-bb000002 { color: blue }",
		"a1-cc000003": ".a1-cc000003 { padding: 8px }",
		"a1-dd000004": ".a1-dd000004 { margin: 0 }",
		"a1-ee000005": ".a1-ee000005 { display: flex }",
	},
	version: 1,
}

/* ── Full critical path: placeholder + late-inject ───────────────── */

describe.concurrent("critical-CSS full injection path", () => {
	it("placeholder emitted before </head> contains empty style with correct id", () => {
		const html = `<html><head><title>T</title></head><body></body></html>`
		const out = injectCriticalPlaceholder(html, "test-nonce")

		expect(out).toContain(`<style id="${CRITICAL_SHEET_ID}"`)
		expect(out).toContain(`nonce="test-nonce"`)
		expect(out.indexOf(`<style id="${CRITICAL_SHEET_ID}"`)).toBeLessThan(out.indexOf("</head>"))
	})

	it("placeholder style tag is empty (no rules yet — body not rendered)", () => {
		const html = `<html><head></head><body></body></html>`
		const out = injectCriticalPlaceholder(html, "n")

		const match = out.match(/<style id="flare-critical"[^>]*>([\s\S]*?)<\/style>/)
		expect(match).toBeTruthy()
		expect(match?.[1]).toBe("")
	})

	it("late-inject: injectCriticalAppend populates style before </body>", () => {
		const html = `<html><head></head><body><div class="a1-aa000001 a1-cc000003"></div></body></html>`
		const out = injectCriticalAppend(html, [], MANIFEST, "nonce-x")

		expect(out).toContain("data-flare-critical-append")
		expect(out).toContain(".a1-aa000001 { color: red }")
		expect(out).toContain(".a1-cc000003 { padding: 8px }")
		expect(out.indexOf("data-flare-critical-append")).toBeLessThan(out.indexOf("</body>"))
	})

	it("full path: placeholder then late-inject → valid HTML with both tags", () => {
		let html = `<html><head></head><body><div class="a1-ee000005"></div></body></html>`
		html = injectCriticalPlaceholder(html, "nonce-abc", MANIFEST.bundleHref)
		html = injectCriticalAppend(html, ["/src/layout.tsx"], MANIFEST, "nonce-abc")

		/* Placeholder is still present (placeholder itself unchanged) */
		expect(html).toContain(`id="${CRITICAL_SHEET_ID}"`)
		/* Late-inject appended with content */
		expect(html).toContain("data-flare-critical-append")
		expect(html).toContain(".a1-ee000005 { display: flex }")
	})
})

/* ── @layer grouping in output ────────────────────────────────────── */

describe.concurrent("critical-CSS layer grouping", () => {
	it("sx-layer classes grouped into @layer sx block", () => {
		const html = `<div class="a1-aa000001 a1-dd000004"></div>`
		const { css } = buildCriticalCss(html, [], MANIFEST)

		/* Both sx-layer rules appear inside a single @layer sx { ... } block */
		expect(css).toContain("@layer sx")
		expect(css).toContain(".a1-aa000001")
		expect(css).toContain(".a1-dd000004")
		/* Confirm they are NOT in an @layer app block */
		expect(css).not.toContain("@layer app")
	})

	it("app-layer classes grouped into @layer app block", () => {
		const html = `<div class="a1-bb000002 a1-cc000003 a1-ee000005"></div>`
		const { css } = buildCriticalCss(html, [], MANIFEST)

		expect(css).toContain("@layer app")
		expect(css).not.toContain("@layer sx")
	})

	it("mixed sx and app classes → both @layer sx and @layer app present", () => {
		const html = `<div class="a1-aa000001 a1-bb000002"></div>`
		const { css } = buildCriticalCss(html, [], MANIFEST)

		expect(css).toContain("@layer sx")
		expect(css).toContain("@layer app")
	})

	it("@layer sx appears before @layer app in output", () => {
		const html = `<div class="a1-aa000001 a1-bb000002"></div>`
		const { css } = buildCriticalCss(html, [], MANIFEST)

		expect(css.indexOf("@layer sx")).toBeLessThan(css.indexOf("@layer app"))
	})

	it("no @layer blocks emitted when no atomic classes match manifest", () => {
		const html = `<div class="btn primary custom-class"></div>`
		const { css } = buildCriticalCss(html, [], MANIFEST)

		expect(css).toBe("")
	})
})

/* ── Module-manifest union ───────────────────────────────────────── */

describe.concurrent("critical-CSS module-manifest union", () => {
	it("classes from rendered modules included even if not in HTML", () => {
		/* HTML has no atomic classes, but /src/button.tsx maps to two classes */
		const html = `<div class="plain-btn"></div>`
		const { css } = buildCriticalCss(html, ["/src/button.tsx"], MANIFEST)

		expect(css).toContain(".a1-aa000001 { color: red }")
		expect(css).toContain(".a1-dd000004 { margin: 0 }")
	})

	it("HTML classes + module classes are unioned without duplicates", () => {
		/* HTML has a1-aa000001, module also maps to it */
		const html = `<div class="a1-aa000001"></div>`
		const { css } = buildCriticalCss(html, ["/src/button.tsx"], MANIFEST)

		const count = (css.match(/\.a1-aa000001/g) ?? []).length
		expect(count).toBe(1)
	})

	it("multiple modules union all their classes", () => {
		const html = `<div></div>`
		const { css } = buildCriticalCss(
			html,
			["/src/button.tsx", "/src/card.tsx", "/src/layout.tsx"],
			MANIFEST,
		)

		for (const rule of Object.values(MANIFEST.rules)) {
			expect(css).toContain(rule)
		}
	})

	it("unknown module ids ignored — only known modules contribute", () => {
		const html = `<div></div>`
		const { css } = buildCriticalCss(html, ["/src/nonexistent.tsx"], MANIFEST)
		expect(css).toBe("")
	})
})

/* ── Preload link injection ───────────────────────────────────────── */

describe.concurrent("critical-CSS preload link", () => {
	it("injectCriticalPlaceholder emits preload link with bundleHref", () => {
		const html = `<html><head></head><body></body></html>`
		const out = injectCriticalPlaceholder(html, "n", "/assets/flare-global-xyz.css")

		expect(out).toContain(`rel="preload"`)
		expect(out).toContain(`as="style"`)
		expect(out).toContain(`href="/assets/flare-global-xyz.css"`)
		expect(out).toContain(`onload="this.rel='stylesheet'"`)
	})

	it("preload link appears before </head>", () => {
		const html = `<html><head></head><body></body></html>`
		const out = injectCriticalPlaceholder(html, "n", "/assets/flare-global.css")

		expect(out.indexOf(`rel="preload"`)).toBeLessThan(out.indexOf("</head>"))
	})

	it("no preload link emitted when bundleHref is undefined", () => {
		const html = `<html><head></head><body></body></html>`
		const out = injectCriticalPlaceholder(html, "n", undefined)

		expect(out).not.toContain(`rel="preload"`)
	})

	it("bundleHref returned from buildCriticalCss when manifest provided", () => {
		const html = `<div class="a1-aa000001"></div>`
		const { bundleHref } = buildCriticalCss(html, [], MANIFEST)

		expect(bundleHref).toBe(MANIFEST.bundleHref)
	})
})

/* ── Nonce handling ──────────────────────────────────────────────── */

describe.concurrent("critical-CSS nonce handling", () => {
	it("nonce attr on placeholder style tag when nonce provided", () => {
		const html = `<html><head></head><body></body></html>`
		const out = injectCriticalPlaceholder(html, "nonce-abc123")

		expect(out).toContain(`nonce="nonce-abc123"`)
	})

	it("nonce attr absent when nonce is empty string", () => {
		const html = `<html><head></head><body></body></html>`
		const out = injectCriticalPlaceholder(html, "")

		const styleTag = out.match(/<style id="flare-critical"[^>]*>/)
		expect(styleTag?.[0]).not.toContain("nonce=")
	})

	it("nonce on late-inject append tag when nonce provided", () => {
		const html = `<html><head></head><body><div class="a1-aa000001"></div></body></html>`
		const out = injectCriticalAppend(html, [], MANIFEST, "nonce-xyz")

		const appendTag = out.match(/<style[^>]*data-flare-critical-append[^>]*>/)
		expect(appendTag?.[0]).toContain(`nonce="nonce-xyz"`)
	})

	it("nonce absent from late-inject tag when nonce is empty", () => {
		const html = `<html><head></head><body><div class="a1-aa000001"></div></body></html>`
		const out = injectCriticalAppend(html, [], MANIFEST, "")

		const appendTag = out.match(/<style[^>]*data-flare-critical-append[^>]*>/)
		expect(appendTag?.[0]).not.toContain("nonce=")
	})

	it("preload link also carries nonce attr", () => {
		const html = `<html><head></head><body></body></html>`
		const out = injectCriticalPlaceholder(html, "nonce-def", "/assets/g.css")

		const linkTag = out.match(/<link[^>]*rel="preload"[^>]*>/)
		expect(linkTag?.[0]).toContain(`nonce="nonce-def"`)
	})
})

/* ── Edge cases ──────────────────────────────────────────────────── */

describe.concurrent("critical-CSS edge cases", () => {
	it("no </head> in buffer — injectCriticalPlaceholder returns buffer unchanged", () => {
		const html = `<html><body></body></html>`
		const out = injectCriticalPlaceholder(html, "n")
		expect(out).toBe(html)
	})

	it("no </body> in buffer — injectCriticalAppend returns buffer unchanged", () => {
		const html = `<div class="a1-aa000001"></div>`
		const out = injectCriticalAppend(html, [], MANIFEST, "n")
		expect(out).toBe(html)
	})

	it("undefined manifest — buildCriticalCss returns empty string", () => {
		const html = `<div class="a1-aa000001"></div>`
		const { css } = buildCriticalCss(html, [], undefined)
		expect(css).toBe("")
	})

	it("undefined manifest — injectCriticalAppend returns buffer unchanged", () => {
		const html = `<html><head></head><body><div class="a1-aa000001"></div></body></html>`
		const out = injectCriticalAppend(html, [], undefined, "n")
		expect(out).toBe(html)
	})

	it("</style> in CSS value escaped in append tag to prevent XSS", () => {
		const manifest: SxCssManifest = {
			...MANIFEST,
			rules: {
				...MANIFEST.rules,
				"a1-aa000001": '.a1-aa000001 { content: "</style>" }',
			},
		}
		const html = `<html><head></head><body><div class="a1-aa000001"></div></body></html>`
		const out = injectCriticalAppend(html, [], manifest, "n")

		/* Raw </style> must not appear inside the injected tag (escaped) */
		const appendContent = out.match(/<style[^>]*data-flare-critical-append[^>]*>([\s\S]*?)<\/style>/)
		expect(appendContent?.[1]).not.toContain("</style>")
		expect(appendContent?.[1]).toContain("<\\/style")
	})

	it("dev-mode sx- prefixed classes extracted from HTML by collectAtomicClasses", () => {
		const html = `<div class="sx-color-red-ab12 sx-padding-8px-cd34 not-atomic"></div>`
		const classes = collectAtomicClasses(html)

		expect(classes.has("sx-color-red-ab12")).toBe(true)
		expect(classes.has("sx-padding-8px-cd34")).toBe(true)
		expect(classes.has("not-atomic")).toBe(false)
	})

	it("empty HTML produces empty critical CSS", () => {
		const { css } = buildCriticalCss("", [], MANIFEST)
		expect(css).toBe("")
	})

	it("bundleHref from manifest returned even when css is empty (no matching classes)", () => {
		const html = `<div class="no-match"></div>`
		const { bundleHref } = buildCriticalCss(html, [], MANIFEST)
		expect(bundleHref).toBe(MANIFEST.bundleHref)
	})
})
