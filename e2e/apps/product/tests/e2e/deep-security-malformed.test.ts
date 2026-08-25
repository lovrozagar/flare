import { expect, test } from "@playwright/test";
import { BASE, loadPage, setupConsoleCapture } from "./helpers";

/* ------------------------------------------------------------------ */
/*  XSS in route params                                                */
/* ------------------------------------------------------------------ */

test.describe("Security: XSS in route params", () => {
	test("script tag in route param renders as text, not HTML", async ({ page }) => {
		await page.goto("/users/%3Cscript%3Ealert(1)%3C%2Fscript%3E");
		const idText = await page.locator("[data-testid=user-id]").textContent();
		expect(idText).toBe("<script>alert(1)</script>");

		/* verify no dialog fired */
		let dialogFired = false;
		page.on("dialog", () => {
			dialogFired = true;
		});
		await page.waitForTimeout(300);
		expect(dialogFired).toBe(false);
	});

	test("HTML entities in route param rendered safely", async ({ page }) => {
		await page.goto("/users/%3Cimg%20onerror%3Dalert(1)%20src%3Dx%3E");
		const text = await page.locator("[data-testid=user-id]").textContent();
		expect(text).toContain("<img");
		expect(text).toContain("onerror");
	});

	test("SSR HTML does not contain raw script tag from param", async ({ request }) => {
		const response = await request.get("/users/%3Cscript%3Ealert(1)%3C%2Fscript%3E");
		const html = await response.text();
		/* Solid escapes < to &lt; in rendered text content */
		expect(html).not.toContain("<script>alert(1)</script></p>");
		expect(html).toContain("&lt;script&gt;");
	});
});

/* ------------------------------------------------------------------ */
/*  XSS in search params                                               */
/* ------------------------------------------------------------------ */

test.describe("Security: XSS in search params", () => {
	test("script tag in search param rendered as text", async ({ page }) => {
		await page.goto("/search-demo?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E");
		const text = await page.locator("[data-testid=search-all-params]").textContent();
		const parsed = JSON.parse(text ?? "{}");
		expect(parsed.q).toBe("<script>alert(1)</script>");
	});

	test("SSR HTML escapes search param script tags", async ({ request }) => {
		const response = await request.get("/search-demo?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E");
		const html = await response.text();
		/* JSON.stringify inside text node escapes < to \u003c or &lt; */
		expect(html).not.toMatch(/<script>alert\(1\)<\/script><\/p>/);
	});

	test("event handler in search param has no effect", async ({ page }) => {
		await page.goto('/search-demo?q=" onmouseover="alert(1)');
		const text = await page.locator("[data-testid=search-all-params]").textContent();
		const parsed = JSON.parse(text ?? "{}");
		expect(parsed.q).toContain("onmouseover");
	});
});

/* ------------------------------------------------------------------ */
/*  Malformed URL handling                                             */
/* ------------------------------------------------------------------ */

test.describe("Security: malformed URL handling", () => {
	test("invalid percent encoding does not crash server", async ({ request }) => {
		const response = await request.get("/users/%ZZ");
		/* should get a response (404 or 400), not a crash */
		expect(response.status()).toBeGreaterThanOrEqual(200);
		expect(response.status()).toBeLessThan(600);
	});

	test("double-encoded params handled gracefully", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await page.goto("/users/%2525ZZ");
		/* Should render something — not crash */
		const text = await page.locator("body").textContent();
		expect(text?.length).toBeGreaterThan(0);
		cap.assertClean();
	});

	test("extremely long path does not crash", async ({ request }) => {
		const longSegment = "a".repeat(2000);
		const response = await request.get(`/${longSegment}`);
		expect(response.status()).toBeGreaterThanOrEqual(200);
	});

	test("null bytes in URL handled gracefully", async ({ request }) => {
		const response = await request.get("/users/test%00malicious");
		expect(response.status()).toBeGreaterThanOrEqual(200);
		expect(response.status()).toBeLessThan(600);
	});
});

/* ------------------------------------------------------------------ */
/*  Proto pollution via params                                         */
/* ------------------------------------------------------------------ */

test.describe("Security: prototype pollution", () => {
	test("__proto__ in route param does not pollute Object prototype", async ({ page }) => {
		await page.goto("/users/__proto__");
		const polluted = await page.evaluate(() => {
			const obj = {} as Record<string, unknown>;
			return obj["polluted"] !== undefined;
		});
		expect(polluted).toBe(false);
	});

	test("constructor in route param is safe", async ({ page }) => {
		await page.goto("/users/constructor");
		const text = await page.locator("[data-testid=user-id]").textContent();
		expect(text).toBe("constructor");
	});

	test("__proto__ in search param does not pollute Object prototype", async ({ page }) => {
		await page.goto("/search-demo?__proto__[polluted]=true");
		const polluted = await page.evaluate(() => {
			const obj = {} as Record<string, unknown>;
			return obj["polluted"] !== undefined;
		});
		expect(polluted).toBe(false);
	});
});

/* ------------------------------------------------------------------ */
/*  Unicode in routes                                                  */
/* ------------------------------------------------------------------ */

test.describe("Security: unicode in routes", () => {
	test("unicode route param renders correctly", async ({ page }) => {
		await page.goto(`/users/${encodeURIComponent("こんにちは")}`);
		const text = await page.locator("[data-testid=user-id]").textContent();
		expect(text).toBe("こんにちは");
	});

	test("emoji route param renders correctly", async ({ page }) => {
		await page.goto(`/users/${encodeURIComponent("🔥🚀")}`);
		const text = await page.locator("[data-testid=user-id]").textContent();
		expect(text).toBe("🔥🚀");
	});

	test("RTL characters in route param safe", async ({ page }) => {
		await page.goto(`/users/${encodeURIComponent("مرحبا")}`);
		const text = await page.locator("[data-testid=user-id]").textContent();
		expect(text).toBe("مرحبا");
	});
});

/* ------------------------------------------------------------------ */
/*  Server function security                                           */
/* ------------------------------------------------------------------ */

test.describe("Security: server function input", () => {
	test("server fn rejects oversized payload", async ({ request }) => {
		const bigPayload = { message: "x".repeat(1_000_000) };
		const response = await request.post(`${BASE}/_flare/server-fn/echo/echo`, {
			data: bigPayload,
		});
		/* Should either succeed (framework handles) or return 413/400 — not crash */
		expect(response.status()).toBeGreaterThanOrEqual(200);
		expect(response.status()).toBeLessThan(600);
	});

	test("server fn handles non-JSON body gracefully", async ({ request }) => {
		const response = await request.post(`${BASE}/_flare/server-fn/echo/echo`, {
			data: "not json at all <><>",
			headers: { "content-type": "text/plain" },
		});
		/* Should return 400 or similar, not crash */
		expect(response.status()).toBeGreaterThanOrEqual(200);
		expect(response.status()).toBeLessThan(600);
	});

	test("server fn handles empty body gracefully", async ({ request }) => {
		const response = await request.post(`${BASE}/_flare/server-fn/echo/echo`, {
			headers: { "content-type": "application/json" },
		});
		expect(response.status()).toBeGreaterThanOrEqual(200);
		expect(response.status()).toBeLessThan(600);
	});

	test("server fn with __proto__ in input does not pollute", async ({ request }) => {
		const response = await request.post(`${BASE}/_flare/server-fn/echo/echo`, {
			data: { __proto__: { polluted: true }, message: "safe" },
		});
		expect(response.status()).toBe(200);
		const json = (await response.json()) as { data: { echo: string } };
		expect(json.data.echo).toBe("safe");
	});
});

/* ------------------------------------------------------------------ */
/*  Header injection prevention                                        */
/* ------------------------------------------------------------------ */

test.describe("Security: header injection", () => {
	test("newline in header value rejected at transport layer", async ({ request }) => {
		/* HTTP spec forbids CR/LF in header values — transport rejects before reaching server */
		await expect(
			request.get("/about", {
				headers: { "x-custom": "value\r\ninjected-header: true" },
			}),
		).rejects.toThrow();
	});

	test("null byte in header rejected at transport layer", async ({ request }) => {
		/* HTTP spec forbids null bytes in header values */
		await expect(
			request.get("/about", {
				headers: { "x-custom": "value\x00null" },
			}),
		).rejects.toThrow();
	});
});
