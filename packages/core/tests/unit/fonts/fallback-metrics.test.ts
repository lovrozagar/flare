import { describe, expect, it } from "vitest";
import { inter } from "../../../src/fonts/inter.ts";
import { montserrat } from "../../../src/fonts/montserrat.ts";
import { poppins } from "../../../src/fonts/poppins.ts";

/**
 * Validates that generated fallback metrics are mathematically correct
 * by recomputing them from @capsizecss/metrics source data.
 *
 * If these tests fail, the populate-fonts.ts pipeline has a calculation bug.
 */

async function loadCapsizeMetrics(name: string) {
	const mod = await import(`@capsizecss/metrics/${name}`);
	return mod.default ?? mod;
}

type Metrics = { ascent: number; descent: number; lineGap: number; unitsPerEm: number; xWidthAvg: number };

function computeFallbackMetrics(font: Metrics, fallback: Metrics) {
	/* width-matched: fallback text wraps like the real font (Capsize xWidthAvg) */
	const sizeAdjust = font.xWidthAvg / font.unitsPerEm / (fallback.xWidthAvg / fallback.unitsPerEm);

	const ascentOverride = font.ascent / (font.unitsPerEm * sizeAdjust);
	const descentOverride = Math.abs(font.descent) / (font.unitsPerEm * sizeAdjust);
	const lineGapOverride = font.lineGap / (font.unitsPerEm * sizeAdjust);

	return {
		ascentOverride: `${(ascentOverride * 100).toFixed(2)}%`,
		descentOverride: `${(descentOverride * 100).toFixed(2)}%`,
		lineGapOverride: `${(lineGapOverride * 100).toFixed(2)}%`,
		sizeAdjust: `${(sizeAdjust * 100).toFixed(2)}%`,
	};
}

describe("fallback metrics correctness", () => {
	it("Inter metrics match @capsizecss calculation", async () => {
		const interMetrics = await loadCapsizeMetrics("inter");
		const arialMetrics = await loadCapsizeMetrics("arial");

		const expected = computeFallbackMetrics(interMetrics, arialMetrics);
		const css = inter.css();

		expect(css).toContain(`size-adjust: ${expected.sizeAdjust}`);
		expect(css).toContain(`ascent-override: ${expected.ascentOverride}`);
		expect(css).toContain(`descent-override: ${expected.descentOverride}`);
		expect(css).toContain(`line-gap-override: ${expected.lineGapOverride}`);
	});

	it("Montserrat metrics match @capsizecss calculation", async () => {
		const montserratMetrics = await loadCapsizeMetrics("montserrat");
		const arialMetrics = await loadCapsizeMetrics("arial");

		const expected = computeFallbackMetrics(montserratMetrics, arialMetrics);
		const css = montserrat.css();

		expect(css).toContain(`size-adjust: ${expected.sizeAdjust}`);
		expect(css).toContain(`ascent-override: ${expected.ascentOverride}`);
		expect(css).toContain(`descent-override: ${expected.descentOverride}`);
	});

	it("Poppins metrics match @capsizecss calculation", async () => {
		const poppinsMetrics = await loadCapsizeMetrics("poppins");
		const arialMetrics = await loadCapsizeMetrics("arial");

		const expected = computeFallbackMetrics(poppinsMetrics, arialMetrics);
		const css = poppins.css();

		expect(css).toContain(`size-adjust: ${expected.sizeAdjust}`);
		expect(css).toContain(`ascent-override: ${expected.ascentOverride}`);
	});

	it("all tested fonts use Arial and its metric-compatible clones as fallback (sans-serif)", () => {
		for (const font of [inter, montserrat, poppins]) {
			const css = font.css();
			expect(css).toContain(
				'src: local("Arial"), local("ArialMT"), local("Liberation Sans"), local("LiberationSans-Regular"), local("Arimo")',
			);
		}
	});

	it("Inter's fallback is width-matched (next/font ships the same 107.12%)", () => {
		expect(inter.css()).toContain("size-adjust: 107.12%");
	});

	it("metrics produce reasonable percentage values", () => {
		const css = inter.css();

		/* extract size-adjust value */
		const sizeMatch = /size-adjust: ([\d.]+)%/.exec(css);
		expect(sizeMatch).toBeTruthy();
		const sizeAdjust = Number.parseFloat(sizeMatch?.[1] ?? "0");

		/* size-adjust should be between 80-120% for most fonts */
		expect(sizeAdjust).toBeGreaterThan(80);
		expect(sizeAdjust).toBeLessThan(120);

		/* ascent should be between 70-130% */
		const ascentMatch = /ascent-override: ([\d.]+)%/.exec(css);
		const ascent = Number.parseFloat(ascentMatch?.[1] ?? "0");
		expect(ascent).toBeGreaterThan(70);
		expect(ascent).toBeLessThan(130);
	});
});
