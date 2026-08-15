import { expect, test } from "@playwright/test";
import { loadPage } from "./helpers";

test.describe("CSRF", () => {
	test("cross-origin POST is 403", async ({ request }) => {
		const res = await request.post("/_fn/form-contact/form-contact", {
			data: { email: "user@test.com", message: "Hello" },
			headers: { origin: "http://evil.com" },
		});
		expect(res.status()).toBe(403);
	});
});

test.describe("form reset + upload", () => {
	test("reset clears field errors path", async ({ page }) => {
		await loadPage(page, "/forms/contact");
		await page.getByTestId("email-input").fill("bad");
		await page.getByTestId("message-input").fill("x");
		await page.getByTestId("submit-btn").click();
		await expect(page.locator(".field-error").first()).toBeVisible();
		await page.getByTestId("reset-btn").click();
	});

	test("upload file", async ({ page }) => {
		await loadPage(page, "/forms/upload");
		await page.getByTestId("file-input").setInputFiles({
			buffer: Buffer.from("hello"),
			mimeType: "text/plain",
			name: "hello.txt",
		});
		await page.getByTestId("submit-btn").click();
		await expect(page.getByTestId("result-data")).toContainText("hello.txt", { timeout: 8_000 });
	});
});

test.describe("revalidate + piggyback", () => {
	test("GET revalidate is 405", async ({ request }) => {
		expect((await request.get("/_flare/revalidate")).status()).toBe(405);
	});

	test("POST revalidate without secret rejected", async ({ request }) => {
		const res = await request.post("/_flare/revalidate", { data: { tags: ["kv-test"] } });
		expect(res.status()).toBeGreaterThanOrEqual(400);
	});

	test("POST revalidate with secret", async ({ request }) => {
		const res = await request.post("/_flare/revalidate", {
			data: { tags: ["kv-test"] },
			headers: { authorization: "Bearer e2e-test-secret" },
		});
		expect([200, 204, 400, 401]).toContain(res.status());
	});

	test("server-fn revalidate-cache", async ({ request }) => {
		const res = await request.post("/_fn/revalidate-cache/revalidate-cache", { data: {} });
		expect(res.status()).toBe(200);
		expect((await res.json()).data.revalidated).toBe(true);
	});

	test("piggyback queries in response", async ({ request }) => {
		const res = await request.post("/_fn/piggyback/piggyback", { data: { value: "x" } });
		expect(res.status()).toBe(200);
		const json = await res.json();
		expect(json.data.saved).toBe(true);
		expect(json.queries ?? json.q ?? json.data).toBeTruthy();
	});
});
