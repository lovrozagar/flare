import { expect, test } from "@playwright/test";
import { loadPage, parseNDJSON, setupConsoleCapture } from "./helpers";

test.describe("NDJSON", () => {
	test("flare-data request is application/x-ndjson", async ({ request }) => {
		const response = await request.get("/about", {
			headers: { "flare-data": "1" },
		});
		expect(response.status()).toBe(200);
		expect(response.headers()["content-type"]).toContain("application/x-ndjson");
	});

	test("unmatched path with flare-data is NDJSON 404, not HTML", async ({ request }) => {
		const response = await request.get("/does-not-exist", {
			headers: { "flare-data": "1" },
		});
		expect(response.status()).toBe(404);
		expect(response.headers()["content-type"]).toContain("application/x-ndjson");
		const body = await response.text();
		expect(body).toContain("NotFoundError");
		expect(body.toLowerCase()).not.toContain("<!doctype html>");
	});

	test("loader message has match id and about data", async ({ request }) => {
		const response = await request.get("/about", {
			headers: { "flare-data": "1" },
		});
		const msgs = parseNDJSON(await response.text());
		const loaders = msgs.filter((m) => m.t === "l");
		expect(loaders.length).toBeGreaterThan(0);

		const pageLoader = loaders.find((m) => {
			const d = m.d as Record<string, unknown> | undefined;
			return d?.content !== undefined;
		});
		expect(pageLoader).toBeDefined();
		expect(typeof pageLoader?.m).toBe("string");
		const data = pageLoader?.d as { content: string; year: number };
		expect(data.content).toBe("This is the about page for the Flare E2E test app.");
		expect(data.year).toBe(2026);
	});

	test("head message title matches page head()", async ({ request }) => {
		const response = await request.get("/about", {
			headers: { "flare-data": "1" },
		});
		const msgs = parseNDJSON(await response.text());
		const heads = msgs.filter((m) => m.t === "h");
		const pageHead = heads.find((h) => {
			const d = h.d as Record<string, unknown> | undefined;
			return typeof d?.title === "string" && (d.title as string).startsWith("About");
		});
		expect(pageHead).toBeDefined();
		expect((pageHead?.d as { title: string } | undefined)?.title).toBe("About - 2026");
	});
});

test.describe("server context", () => {
	test("loader reads generated request id", async ({ page }) => {
		const console = setupConsoleCapture(page);
		await loadPage(page, "/context");
		const requestId = await page.getByTestId("request-id").textContent();
		expect(requestId).toBeTruthy();
		await expect(page.getByTestId("ctx-has-uuid")).toHaveText("true");
		await expect(page.getByTestId("ctx-ua-present")).toHaveText("true");
		console.assertClean();
	});

	test("x-request-id header is forwarded", async ({ page }) => {
		await page.setExtraHTTPHeaders({ "x-request-id": "custom-req-42" });
		await loadPage(page, "/context");
		await expect(page.getByTestId("request-id")).toHaveText("custom-req-42");
		await expect(page.getByTestId("ctx-has-uuid")).toHaveText("false");
	});
});
