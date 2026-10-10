import { expect, test } from "@playwright/test";
import { loadPage, setupConsoleCapture, BASE } from "./helpers";

/* ── Empty/null/falsy inputs — no crash, no data-c pollution ────────── */

test.describe("sx: edge — empty sx object", () => {
	test("element renders without crash", async ({ page }) => {
		await loadPage(page, "/styling-sx-edge-empty");
		await expect(page.getByTestId("empty-sx")).toBeVisible();
	});

	test("empty sx does not add unexpected class or data-c", async ({ page }) => {
		await loadPage(page, "/styling-sx-edge-empty");
		const el = page.getByTestId("empty-sx");
		const dataC = await el.getAttribute("data-c");
		expect(dataC).toBeNull();
		/* class attr may be absent or empty — no synthetic sx class injected */
		const cls = (await el.getAttribute("class")) ?? "";
		expect(cls.trim()).toBe("");
	});

	test("no console errors", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/styling-sx-edge-empty");
		cap.assertClean();
	});
});

test.describe("sx: edge — empty class string", () => {
	test("element renders without crash", async ({ page }) => {
		await loadPage(page, "/styling-sx-edge-empty");
		await expect(page.getByTestId("empty-class")).toBeVisible();
	});
});

test.describe("sx: edge — falsy branches in class array", () => {
	test("only truthy class survives", async ({ page }) => {
		await loadPage(page, "/styling-sx-edge-empty");
		const cls = await page.getByTestId("falsy-branches").getAttribute("class");
		expect(cls).toContain("base-class");
		expect(cls ?? "").not.toContain("never-added");
	});

	test("no stray null/undefined literal in class string", async ({ page }) => {
		await loadPage(page, "/styling-sx-edge-empty");
		const cls = (await page.getByTestId("falsy-branches").getAttribute("class")) ?? "";
		expect(cls).not.toContain("null");
		expect(cls).not.toContain("undefined");
		expect(cls).not.toContain("false");
	});
});

test.describe("sx: edge — zero numeric sx values", () => {
	test("zero margin and padding render without crash", async ({ page }) => {
		await loadPage(page, "/styling-sx-edge-empty");
		await expect(page.getByTestId("zero-values")).toBeVisible();
	});

	test("zero values produce 0px computed styles", async ({ page }) => {
		await loadPage(page, "/styling-sx-edge-empty");
		const cs = await page.getByTestId("zero-values").evaluate((el) => {
			const s = getComputedStyle(el);
			return { margin: s.margin, padding: s.padding };
		});
		expect(cs.margin).toMatch(/^0/);
		expect(cs.padding).toMatch(/^0/);
	});
});

test.describe("sx: edge — SSR empty/edge page", () => {
	test("SSR renders all edge-case testids", async ({ page }) => {
		const res = await page.request.get(`${BASE}/styling-sx-edge-empty`);
		const html = await res.text();
		expect(html).toContain('data-testid="empty-sx"');
		expect(html).toContain('data-testid="empty-class"');
		expect(html).toContain('data-testid="falsy-branches"');
		expect(html).toContain('data-testid="zero-values"');
	});
});

/* ── Deep nesting and @supports/@container ──────────────────────────── */

test.describe("sx: edge — deep nested selectors", () => {
	test("base color applied on deep-nested element", async ({ page }) => {
		await loadPage(page, "/styling-sx-edge-deep");
		const color = await page.getByTestId("deep-nested").evaluate((el) => getComputedStyle(el).color);
		expect(color).toBe("rgb(0, 0, 0)");
	});

	test("no console errors", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/styling-sx-edge-deep");
		cap.assertClean();
	});
});

test.describe("sx: edge — @supports display:grid", () => {
	test("supports-grid element has display:grid when supported", async ({ page }) => {
		await loadPage(page, "/styling-sx-edge-deep");
		const display = await page.getByTestId("supports-grid").evaluate((el) => getComputedStyle(el).display);
		/* All modern browsers support display:grid */
		expect(display).toBe("grid");
	});
});

test.describe("sx: edge — negative margin", () => {
	test("element renders without crash", async ({ page }) => {
		await loadPage(page, "/styling-sx-edge-deep");
		await expect(page.getByTestId("negative-margin")).toBeVisible();
	});

	test("computed margin is negative", async ({ page }) => {
		await loadPage(page, "/styling-sx-edge-deep");
		const margin = await page.getByTestId("negative-margin").evaluate((el) => getComputedStyle(el).marginTop);
		/* -4px or -4 */
		expect(parseFloat(margin)).toBeLessThan(0);
	});
});

test.describe("sx: edge — many declarations (stress)", () => {
	test("element renders with correct color from many-decl sx", async ({ page }) => {
		await loadPage(page, "/styling-sx-edge-deep");
		const color = await page.getByTestId("many-decls").evaluate((el) => getComputedStyle(el).color);
		expect(color).toBe("rgb(20, 20, 20)");
	});

	test("element renders with correct border-radius", async ({ page }) => {
		await loadPage(page, "/styling-sx-edge-deep");
		const radius = await page.getByTestId("many-decls").evaluate((el) => getComputedStyle(el).borderRadius);
		expect(radius).toBe("4px");
	});

	test("SSR renders deep-edge testids", async ({ page }) => {
		const res = await page.request.get(`${BASE}/styling-sx-edge-deep`);
		const html = await res.text();
		expect(html).toContain('data-testid="deep-nested"');
		expect(html).toContain('data-testid="many-decls"');
	});
});
