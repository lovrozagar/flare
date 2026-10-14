import { request as httpRequest } from "node:http";
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

// A POST whose body waits for the server's go-ahead (`Expect: 100-continue`). workerd answers an oversized body's 413
// without reading it, then resets the connection with the body unread, so a client still sending or reading late lost
// the answer to ECONNRESET. With the header nothing is sent unread. workerd sends no `100 Continue`, so on Workers only
// an answer that reads no body comes back, as the cap's 413 does; a handler that read it would hang (BUGS.md 104).
function postExpectingContinue(url: string, origin: string, body: string): Promise<number> {
	return new Promise((resolve, reject) => {
		const call = httpRequest(url, {
			method: "POST",
			headers: {
				origin,
				"content-type": "application/json",
				"content-length": Buffer.byteLength(body),
				expect: "100-continue",
			},
		});
		call.on("continue", () => call.end(body));
		call.on("response", (response) => {
			response.resume();
			response.on("end", () => resolve(response.statusCode ?? 0));
		});
		call.on("error", reject);
		call.flushHeaders();
	});
}

test("body limit", async ({ request, docs }) => {
	const url = `${docs.origin}/_flare/fn/${ECHO}`;
	const small = await request.post(url, { headers: { origin: docs.origin }, data: { text: "hi" } });
	expect(small.status()).toBe(200);
	expect(await postExpectingContinue(url, docs.origin, JSON.stringify({ text: "x".repeat(70 * 1024) }))).toBe(413);
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
