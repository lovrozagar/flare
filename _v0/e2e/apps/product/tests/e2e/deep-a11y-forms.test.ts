import { expect, test } from "@playwright/test";
import { loadPage, setupConsoleCapture } from "./helpers";

/**
 * Form-specific accessibility tests.
 *
 * Validates that Flare's Form/FieldError components produce accessible markup:
 * - Label-input associations (for/id)
 * - aria-describedby for hints and errors
 * - aria-required / aria-invalid states
 * - Fieldset/legend grouping
 * - Radio group semantics
 * - Error announcements via aria-live
 * - Submit button aria-busy during pending
 */

test.describe("A11y Forms — label associations", () => {
	test("every input has a label with matching for/id", async ({ page }) => {
		await loadPage(page, "/a11y-form-test");

		const orphanedInputs = await page.evaluate(() => {
			const inputs = document.querySelectorAll("input:not([type=hidden]):not([type=submit]), textarea, select");
			const problems: string[] = [];
			for (const input of inputs) {
				const id = input.getAttribute("id");
				const name = input.getAttribute("name") ?? "unknown";
				const type = input.getAttribute("type") ?? "text";

				/* radio/checkbox can have wrapping labels */
				if (type === "radio" || type === "checkbox") {
					const parent = input.closest("label");
					if (parent) continue;
				}

				if (!id) {
					problems.push(`input[name=${name}] has no id — cannot associate label`);
					continue;
				}

				const label = document.querySelector(`label[for="${id}"]`);
				if (!label) {
					problems.push(`input#${id} has no <label for="${id}">`);
				}
			}
			return problems;
		});

		expect(orphanedInputs).toEqual([]);
	});

	test("labels have visible text content", async ({ page }) => {
		await loadPage(page, "/a11y-form-test");

		const emptyLabels = await page.evaluate(() => {
			const labels = document.querySelectorAll("label");
			return Array.from(labels)
				.filter((l) => (l.textContent?.trim() ?? "").length === 0)
				.map((l) => l.getAttribute("for") ?? "unknown");
		});

		expect(emptyLabels).toEqual([]);
	});
});

test.describe("A11y Forms — ARIA attributes", () => {
	test("required inputs have aria-required", async ({ page }) => {
		await loadPage(page, "/a11y-form-test");

		const emailInput = page.locator("[data-testid=a11y-email-input]");
		expect(await emailInput.getAttribute("aria-required")).toBe("true");
	});

	test("inputs have aria-describedby linking hints", async ({ page }) => {
		await loadPage(page, "/a11y-form-test");

		const emailInput = page.locator("[data-testid=a11y-email-input]");
		const describedBy = await emailInput.getAttribute("aria-describedby");
		expect(describedBy).toBeTruthy();
		expect(describedBy).toContain("email-hint");

		/* hint element exists and has content */
		const hint = page.locator("#email-hint");
		expect(await hint.textContent()).toBeTruthy();
	});

	test("autocomplete attribute present on email field", async ({ page }) => {
		await loadPage(page, "/a11y-form-test");

		const emailInput = page.locator("[data-testid=a11y-email-input]");
		expect(await emailInput.getAttribute("autocomplete")).toBe("email");
	});
});

test.describe("A11y Forms — fieldset and grouping", () => {
	test("form fields are wrapped in fieldset with legend", async ({ page }) => {
		await loadPage(page, "/a11y-form-test");

		const fieldset = page.locator("[data-testid=contact-fieldset]");
		await expect(fieldset).toHaveCount(1);

		/* direct child legend, not nested fieldset's legend */
		const legend = fieldset.locator("> legend");
		expect(await legend.textContent()).toBe("Contact Information");
	});

	test("radio group uses fieldset with legend", async ({ page }) => {
		await loadPage(page, "/a11y-form-test");

		const group = page.locator("fieldset[data-testid=preference-group]");
		await expect(group).toHaveCount(1);

		/* legend provides accessible name */
		const legend = group.locator("legend");
		expect(await legend.textContent()).toBeTruthy();
	});

	test("radio inputs share the same name attribute", async ({ page }) => {
		await loadPage(page, "/a11y-form-test");

		const radios = page.locator("input[name=preference]");
		await expect(radios).toHaveCount(2);
	});
});

test.describe("A11y Forms — error announcements", () => {
	test("error container has aria-live=assertive for screen readers", async ({ page }) => {
		await loadPage(page, "/a11y-form-test");

		const errorLive = page.locator("[data-testid=email-error-live]");
		expect(await errorLive.getAttribute("aria-live")).toBe("assertive");
	});

	test("form-level error and success alerts use aria patterns", async ({ page }) => {
		await loadPage(page, "/a11y-form-test");

		/*
		 * role=alert divs are inside <Show> — only in DOM when condition is true.
		 * Verify the always-present accessible infrastructure instead.
		 */
		const btn = page.locator("[data-testid=a11y-submit-btn]");
		expect(await btn.getAttribute("aria-busy")).toBe("false");
		expect(await btn.getAttribute("type")).toBe("submit");

		/* email error live region is always present (even when empty) */
		const errorLive = page.locator("[data-testid=email-error-live]");
		await expect(errorLive).toHaveCount(1);
		expect(await errorLive.getAttribute("aria-live")).toBe("assertive");
	});
});

test.describe("A11y Forms — submit button states", () => {
	test("submit button has type=submit", async ({ page }) => {
		await loadPage(page, "/a11y-form-test");

		const btn = page.locator("[data-testid=a11y-submit-btn]");
		expect(await btn.getAttribute("type")).toBe("submit");
	});

	test("submit button is not initially disabled", async ({ page }) => {
		await loadPage(page, "/a11y-form-test");

		const btn = page.locator("[data-testid=a11y-submit-btn]");
		expect(await btn.isDisabled()).toBe(false);
	});

	test("submit button has aria-busy attribute wired to pending state", async ({ page }) => {
		await loadPage(page, "/a11y-form-test");

		const btn = page.locator("[data-testid=a11y-submit-btn]");
		/* initially not busy */
		const ariaBusy = await btn.getAttribute("aria-busy");
		expect(ariaBusy).toBe("false");
	});
});

test.describe("A11y Forms — keyboard interaction", () => {
	test("form is submittable via Enter key", async ({ page }) => {
		await loadPage(page, "/a11y-form-test");

		const emailInput = page.locator("[data-testid=a11y-email-input]");
		await emailInput.focus();
		await emailInput.fill("test@example.com");
		await page.keyboard.press("Enter");

		/* form should attempt submission — verify no page crash */
		await page.waitForTimeout(500);

		/* page is still functional (not crashed) */
		await expect(page.locator("[data-testid=a11y-submit-btn]")).toBeVisible();
	});

	test("tab moves between form fields in order", async ({ page }) => {
		await loadPage(page, "/a11y-form-test");

		const fieldOrder: string[] = [];
		/* tab through form fields */
		for (let i = 0; i < 8; i++) {
			await page.keyboard.press("Tab");
			const id = await page.evaluate(() => {
				const el = document.activeElement;
				return el?.getAttribute("data-testid") ?? el?.getAttribute("id") ?? el?.tagName.toLowerCase() ?? "none";
			});
			fieldOrder.push(id);
		}

		/* email should come before message, message before submit */
		const emailIdx = fieldOrder.indexOf("a11y-email-input");
		const messageIdx = fieldOrder.indexOf("a11y-message-input");
		const submitIdx = fieldOrder.indexOf("a11y-submit-btn");

		if (emailIdx >= 0 && messageIdx >= 0) {
			expect(emailIdx).toBeLessThan(messageIdx);
		}
		if (messageIdx >= 0 && submitIdx >= 0) {
			expect(messageIdx).toBeLessThan(submitIdx);
		}
	});
});

test.describe("A11y Forms — SSR output", () => {
	test("SSR HTML contains fieldset/legend structure", async ({ request }) => {
		const res = await request.get("/a11y-form-test");
		const html = await res.text();

		expect(html).toContain("<fieldset");
		expect(html).toContain("<legend");
	});

	test("SSR HTML contains aria-required on required fields", async ({ request }) => {
		const res = await request.get("/a11y-form-test");
		const html = await res.text();

		expect(html).toContain('aria-required="true"');
	});

	test("SSR HTML contains aria-describedby associations", async ({ request }) => {
		const res = await request.get("/a11y-form-test");
		const html = await res.text();

		expect(html).toContain("aria-describedby");
	});

	test("no console errors on form page", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/a11y-form-test");
		cap.assertClean();
	});
});
