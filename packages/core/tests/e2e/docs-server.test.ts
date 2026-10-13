import { deepOnly, expect, fnId, INDEX_NOW_KEY, nonces, open, sessionCookie, test } from "./docs.fixture.ts";

// Auth, CSRF, the body cap, middleware, mounts, `.response()`, route headers, and security (bits/15 docs-server).
deepOnly();

const ECHO = fnId("src/fns/echo.ts", "echo");

test("unauthenticated", async ({ page, docs }) => {
	const response = await page.goto(`${docs.origin}/admin`);
	expect(response?.status()).toBe(401);
	await expect(page.locator("#admin-401")).toBeVisible();
	await page.waitForSelector("html[data-flare-hydrated]", { state: "attached" });
});

test("unauthorized", async ({ page, docs, context }) => {
	await context.addCookies([sessionCookie(docs.origin, "bob", "reader")]);
	const response = await page.goto(`${docs.origin}/admin`);
	expect(response?.status()).toBe(403);
	await expect(page.locator("#admin-403")).toBeVisible();
});

test("login cookie", async ({ page, docs }) => {
	await open(page, docs.origin, "/login");
	await page.locator("#login-user").fill("ada");
	await page.locator("#login-admin").click();
	await expect(page).toHaveURL(`${docs.origin}/admin`);
	await expect(page.locator("#admin-greeting")).toHaveText("Hi ada");
	await expect(page.locator("#admin-caller")).toHaveText('["admin"]');
});

test("authenticate optional", async ({ page, docs, context }) => {
	await open(page, docs.origin, "/login");
	await expect(page.locator("#login-admin")).toBeVisible();
	await context.addCookies([sessionCookie(docs.origin, "ada", "admin")]);
	await open(page, docs.origin, "/login");
	await expect(page.locator("#session")).toHaveText("Signed in as ada (Administrator)");
});

test("csrf", async ({ request, docs }) => {
	const response = await request.post(`${docs.origin}/_flare/fn/${ECHO}`, {
		headers: { origin: "https://evil.test", "content-type": "application/json" },
		data: { text: "hi" },
	});
	expect(response.status()).toBe(403);
});

test("body limit", async ({ request, docs }) => {
	const response = await request.post(`${docs.origin}/_flare/fn/${ECHO}`, {
		headers: { origin: docs.origin, "content-type": "application/json" },
		data: JSON.stringify({ text: "x".repeat(70 * 1024) }),
	});
	expect(response.status()).toBe(413);
});

test("middleware next", async ({ request, docs }) => {
	const response = await request.get(`${docs.origin}/`);
	expect(response.headers()["x-docs-time"]).toMatch(/^\d+ms$/);
});

test("middleware respond", async ({ request, docs }) => {
	const response = await request.get(`${docs.origin}/maintenance`);
	expect(response.status()).toBe(503);
	expect(response.headers()["retry-after"]).toBe("60");
	expect(await response.text()).toBe("Down for maintenance");
	expect(response.headers()["x-content-type-options"]).toBe("nosniff");
});

test("middleware bypass", async ({ request, docs }) => {
	const response = await request.post(`${docs.origin}/_flare/fn/${ECHO}`, {
		headers: { origin: docs.origin, "content-type": "application/json", "x-docs-ping": "1" },
		data: { text: "hi" },
	});
	expect(await response.text()).toBe("pong");
});

test("middleware prefix", async ({ request, docs }) => {
	expect((await request.get(`${docs.origin}/docs/routing`)).headers()["x-docs-section"]).toBe("docs");
	expect((await request.get(`${docs.origin}/`)).headers()["x-docs-section"]).toBeUndefined();
});

test("mount", async ({ request, docs }) => {
	const response = await request.get(`${docs.origin}/healthz/deep?x=1`);
	expect(await response.json()).toEqual({ ok: true, path: "/deep" });
	expect(response.headers()["x-content-type-options"]).toBe("nosniff");
});

test("response route", async ({ request, docs }) => {
	const response = await request.get(`${docs.origin}/llms.txt`);
	expect(response.headers()["content-type"]).toBe("text/plain; charset=utf-8");
	expect(response.headers()["cache-control"]).toBe("public, max-age=300");
	expect(await response.text()).toMatch(/^# Flare docs\n\n- \[Routing\]/);
});

test("route headers", async ({ request, docs }) => {
	expect((await request.get(`${docs.origin}/admin`)).headers()["x-docs-area"]).toBe("admin");
});

test("route security", async ({ request, docs }) => {
	const response = await request.get(`${docs.origin}/admin`);
	expect(response.headers()["x-frame-options"]).toBe("DENY");
	const seen = nonces(response.headers()["content-security-policy"], await response.text());
	expect(seen.body).toEqual([seen.header]);
});

test("security defaults", async ({ request, docs }) => {
	const response = await request.get(`${docs.origin}/playground`);
	const headers = response.headers();
	expect(headers["x-content-type-options"]).toBe("nosniff");
	expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
	expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
	expect(headers["permissions-policy"]).toContain("camera=()");
	expect(headers["strict-transport-security"]).toBeUndefined();
	const seen = nonces(headers["content-security-policy"], await response.text());
	expect(seen.body).toEqual([seen.header]);
});

test("indexnow key file", async ({ request, docs }) => {
	const response = await request.get(`${docs.origin}/${INDEX_NOW_KEY}.txt`);
	expect(response.status()).toBe(200);
	expect(response.headers()["content-type"]).toMatch(/^text\/plain/);
	expect((await response.text()).trim()).toBe(INDEX_NOW_KEY);
});
