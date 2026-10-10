import { expect, test } from "@playwright/test";
import { BASE, loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

test.describe("Cascade: global class + scoped styles()", () => {
	test("element with both global class and styles() gets both applied", async ({ page }) => {
		await loadPage(page, "/styling-cascade");
		const el = page.getByTestId("cascade-global-scoped");

		const computed = await el.evaluate((e) => {
			const cs = getComputedStyle(e);
			return { color: cs.color, fontWeight: cs.fontWeight, padding: cs.padding };
		});
		/* global sets color red, scoped sets font-weight + padding */
		expect(computed.color).toBe("rgb(255, 0, 0)");
		expect(Number(computed.fontWeight)).toBeGreaterThanOrEqual(700);
		expect(computed.padding).toBe("8px");
	});

	test("has both class and data-c attributes", async ({ page }) => {
		await loadPage(page, "/styling-cascade");
		const el = page.getByTestId("cascade-global-scoped");

		const cls = await el.getAttribute("class");
		expect(cls).toContain("cascade-global");

		const dataC = await el.getAttribute("data-c");
		expect(dataC).toBeTruthy();
	});
});

test.describe("Cascade: global custom style vs scoped", () => {
	test("custom head() styles appear after scoped — last-in-source wins at equal specificity", async ({ page }) => {
		await loadPage(page, "/styling-cascade");
		const el = page.getByTestId("cascade-override");

		/* custom head styles inject after __FLARE_SCOPED__ — global wins at equal specificity */
		const color = await el.evaluate((e) => getComputedStyle(e).color);
		expect(color).toBe("rgb(255, 0, 0)");
	});

	test("scoped [data-c] and global class both present on same element", async ({ page }) => {
		await loadPage(page, "/styling-cascade");
		const el = page.getByTestId("cascade-override");

		const cls = await el.getAttribute("class");
		expect(cls).toContain("cascade-global");

		const dataC = await el.getAttribute("data-c");
		expect(dataC).toBeTruthy();
	});
});

test.describe("Cascade: state + mode switching", () => {
	test("initial mode=light has correct colors", async ({ page }) => {
		await loadPage(page, "/styling-cascade");
		const box = page.getByTestId("cascade-state");

		const computed = await box.evaluate((el) => {
			const cs = getComputedStyle(el);
			return { background: cs.backgroundColor, color: cs.color };
		});
		expect(computed.color).toBe("rgb(0, 0, 0)");
		expect(computed.background).toBe("rgb(255, 255, 255)");
		expect(await box.getAttribute("data-mode")).toBe("light");
	});

	test("toggle to dark mode changes both color and background", async ({ page }) => {
		await loadPage(page, "/styling-cascade");
		await page.getByTestId("toggle-mode").click();

		const box = page.getByTestId("cascade-state");
		const computed = await box.evaluate((el) => {
			const cs = getComputedStyle(el);
			return { background: cs.backgroundColor, color: cs.color };
		});
		expect(computed.color).toBe("rgb(255, 255, 255)");
		expect(computed.background).toBe("rgb(0, 0, 0)");
		expect(await box.getAttribute("data-mode")).toBe("dark");
	});

	test("double toggle returns to light", async ({ page }) => {
		await loadPage(page, "/styling-cascade");
		const btn = page.getByTestId("toggle-mode");
		await btn.click();
		await btn.click();

		const box = page.getByTestId("cascade-state");
		expect(await box.getAttribute("data-mode")).toBe("light");
		const color = await box.evaluate((el) => getComputedStyle(el).color);
		expect(color).toBe("rgb(0, 0, 0)");
	});
});

test.describe("Cascade: deep nesting color inheritance", () => {
	test("outer has red, middle has bg, inner inherits outer red", async ({ page }) => {
		await loadPage(page, "/styling-cascade");

		const outerColor = await page.getByTestId("cascade-outer").evaluate((el) => getComputedStyle(el).color);
		expect(outerColor).toBe("rgb(200, 0, 0)");

		const middleBg = await page.getByTestId("cascade-middle").evaluate((el) => getComputedStyle(el).backgroundColor);
		expect(middleBg).toBe("rgb(240, 240, 240)");

		/* inner inherits color from outer since it only sets font-style */
		const innerColor = await page.getByTestId("cascade-inner").evaluate((el) => getComputedStyle(el).color);
		expect(innerColor).toBe("rgb(200, 0, 0)");

		const innerStyle = await page.getByTestId("cascade-inner").evaluate((el) => getComputedStyle(el).fontStyle);
		expect(innerStyle).toBe("italic");
	});

	test("each nesting level has own data-c", async ({ page }) => {
		await loadPage(page, "/styling-cascade");

		const outerC = await page.getByTestId("cascade-outer").getAttribute("data-c");
		const middleC = await page.getByTestId("cascade-middle").getAttribute("data-c");
		const innerC = await page.getByTestId("cascade-inner").getAttribute("data-c");

		expect(new Set([outerC, middleC, innerC]).size).toBe(3);
	});
});

test.describe("Cascade: SSR correctness", () => {
	test("SSR HTML has global class + data-c + state attrs", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-cascade`);
		const html = await response.text();
		expect(html).toContain("cascade-global");
		expect(html).toContain("data-c=");
		expect(html).toContain('data-mode="light"');
	});
});

test.describe("Cascade: SPA round-trip", () => {
	test("toggled dark mode resets after SPA nav", async ({ page }) => {
		await loadPage(page, "/styling-cascade");
		await page.getByTestId("toggle-mode").click();

		await navigateSPA(page, "/about");
		await navigateSPA(page, "/styling-cascade");

		/* fresh component = light mode */
		const mode = await page.getByTestId("cascade-state").getAttribute("data-mode");
		expect(mode).toBe("light");
	});
});

test.describe("Cascade: console clean", () => {
	test("no errors on cascade page with toggles", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/styling-cascade");
		await page.getByTestId("toggle-mode").click();
		await page.getByTestId("toggle-mode").click();
		cap.assertClean();
	});
});
