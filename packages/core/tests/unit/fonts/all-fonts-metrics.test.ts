import { describe, expect, it } from "vitest"
import { FONT_REGISTRY } from "../../../src/fonts/registry.gen.ts"

/**
 * Dynamically validates ALL 201 fonts' fallback metrics by recomputing
 * from @capsizecss/metrics source data.
 *
 * If these tests fail, the populate-fonts.ts pipeline has a calculation bug.
 */

type Metrics = {
	ascent: number
	descent: number
	lineGap: number
	unitsPerEm: number
}

function toCapsizeSlug(family: string): string {
	const noSpaces = family.replace(/ /g, "")
	return noSpaces[0].toLowerCase() + noSpaces.slice(1)
}

function fallbackFontForCategory(category: string): string {
	switch (category) {
		case "serif":
			return "Times New Roman"
		case "monospace":
			return "Courier New"
		default:
			return "Arial"
	}
}

function fallbackCapsizeSlug(category: string): string {
	return toCapsizeSlug(fallbackFontForCategory(category))
}

async function loadCapsizeMetrics(name: string): Promise<Metrics | undefined> {
	try {
		const mod = await import(`@capsizecss/metrics/${name}`)
		return mod.default ?? mod
	} catch {
		return undefined
	}
}

function computeFallbackMetrics(font: Metrics, fallback: Metrics) {
	const sizeAdjust =
		(font.unitsPerEm / fallback.unitsPerEm) *
		((fallback.ascent - fallback.descent + fallback.lineGap) /
			(font.ascent - font.descent + font.lineGap))

	const ascentOverride = font.ascent / (font.unitsPerEm * sizeAdjust)
	const descentOverride = Math.abs(font.descent) / (font.unitsPerEm * sizeAdjust)
	const lineGapOverride = font.lineGap / (font.unitsPerEm * sizeAdjust)

	return {
		ascentOverride: `${(ascentOverride * 100).toFixed(2)}%`,
		descentOverride: `${(descentOverride * 100).toFixed(2)}%`,
		lineGapOverride: `${(lineGapOverride * 100).toFixed(2)}%`,
		sizeAdjust: `${(sizeAdjust * 100).toFixed(2)}%`,
	}
}

let withMetricsCount = 0
let withoutMetricsCount = 0

describe("all fonts have valid structure", () => {
	for (const [family, slug, camelName, category] of FONT_REGISTRY) {
		it(`${family} (${slug}) has required properties`, async () => {
			const mod = await import(`../../../src/fonts/${slug}`)
			const font = mod[camelName]

			expect(font).toBeDefined()
			expect(font.family).toBe(family)
			expect(font.category).toBe(category)
			expect(typeof font.css).toBe("function")
			expect(typeof font.fontFamily).toBe("string")
			expect(font.fontFamily.length).toBeGreaterThan(0)
			expect(Array.isArray(font.subsets)).toBe(true)
			expect(font.subsets.length).toBeGreaterThan(0)
		})
	}
})

describe("all fonts with capsizecss data have correct fallback metrics", () => {
	for (const [family, slug, camelName, category] of FONT_REGISTRY) {
		it(`${family} fallback metrics match @capsizecss calculation`, async () => {
			const capsizeSlug = toCapsizeSlug(family)
			const fontMetrics = await loadCapsizeMetrics(capsizeSlug)

			if (!fontMetrics) {
				withoutMetricsCount++
				return
			}

			withMetricsCount++

			const fallbackSlug = fallbackCapsizeSlug(category)
			const fallbackMetrics = await loadCapsizeMetrics(fallbackSlug)
			expect(fallbackMetrics).toBeDefined()

			const expected = computeFallbackMetrics(fontMetrics, fallbackMetrics as Metrics)

			const mod = await import(`../../../src/fonts/${slug}`)
			const font = mod[camelName]
			const css: string = font.css()

			const expectedFallback = fallbackFontForCategory(category)
			expect(css).toContain(`src: local("${expectedFallback}")`)
			expect(css).toContain(`font-family: "${family} Fallback"`)
			expect(css).toContain(`size-adjust: ${expected.sizeAdjust}`)
			expect(css).toContain(`ascent-override: ${expected.ascentOverride}`)
			expect(css).toContain(`descent-override: ${expected.descentOverride}`)
			expect(css).toContain(`line-gap-override: ${expected.lineGapOverride}`)

			/* fontFamily string includes fallback name and generic family */
			expect(font.fontFamily).toContain(`"${family} Fallback"`)

			const sizeMatch = /size-adjust: ([\d.]+)%/.exec(css)
			expect(sizeMatch).toBeTruthy()
			const sizeAdjust = Number.parseFloat(sizeMatch?.[1] ?? "0")
			expect(sizeAdjust).toBeGreaterThan(30)
			expect(sizeAdjust).toBeLessThan(200)

			const ascentMatch = /ascent-override: ([\d.]+)%/.exec(css)
			const ascent = Number.parseFloat(ascentMatch?.[1] ?? "0")
			expect(ascent).toBeGreaterThan(30)
			expect(ascent).toBeLessThan(300)
		})
	}

	it("logs coverage summary", () => {
		console.log(
			`[all-fonts-metrics] ${withMetricsCount} fonts with fallback metrics, ${withoutMetricsCount} fonts without capsizecss data`,
		)
		/* all 201 should have capsizecss data */
		expect(withMetricsCount + withoutMetricsCount).toBe(FONT_REGISTRY.length)
	})
})
