import { createServer, request as httpRequest } from "node:http"
import type { AddressInfo, Socket } from "node:net"
import { deepOnly, expect, fnId, INDEX_NOW_KEY, nonces, open, sessionCookie, test } from "./docs.fixture.ts"

// Auth, CSRF, the body cap, middleware, mounts, `.response()`, route headers, and security (bits/15 docs-server).
deepOnly()

const ECHO = fnId("src/fns/echo.ts", "echo")

test("unauthenticated", async ({ page, docs }) => {
	const response = await page.goto(`${docs.origin}/admin`)
	expect(response?.status()).toBe(401)
	await expect(page.locator("#admin-401")).toBeVisible()
	await page.waitForSelector("html[data-flare-hydrated]", { state: "attached" })
})

test("unauthorized", async ({ page, docs, context }) => {
	await context.addCookies([sessionCookie(docs.origin, "bob", "reader")])
	const response = await page.goto(`${docs.origin}/admin`)
	expect(response?.status()).toBe(403)
	await expect(page.locator("#admin-403")).toBeVisible()
})

// A loader that reads an optional session throws `unauthenticated()` for a guest and `unauthorized()` for a reader,
// which paint the admin root's 401 and 403 boundaries; an admin gets the page (BUGS.md 105).
test("auth throws", async ({ page, docs, context }) => {
	const guest = await page.goto(`${docs.origin}/admin/audit`)
	expect(guest?.status()).toBe(401)
	await expect(page.locator("#admin-401")).toBeVisible()
	await context.addCookies([sessionCookie(docs.origin, "bob", "reader")])
	const reader = await page.goto(`${docs.origin}/admin/audit`)
	expect(reader?.status()).toBe(403)
	await expect(page.locator("#admin-403")).toBeVisible()
	await context.addCookies([sessionCookie(docs.origin, "ada", "admin")])
	const admin = await page.goto(`${docs.origin}/admin/audit`)
	expect(admin?.status()).toBe(200)
	await expect(page.locator("#audit-title")).toHaveText("Audit log for ada")
})

test("login cookie", async ({ page, docs }) => {
	await open(page, docs.origin, "/login")
	await page.locator("#login-user").fill("ada")
	await page.locator("#login-admin").click()
	await expect(page).toHaveURL(`${docs.origin}/admin`)
	await expect(page.locator("#admin-greeting")).toHaveText("Hi ada")
	await expect(page.locator("#admin-caller")).toHaveText('["admin"]')
})

test("authenticate optional", async ({ page, docs, context }) => {
	await open(page, docs.origin, "/login")
	await expect(page.locator("#login-admin")).toBeVisible()
	await context.addCookies([sessionCookie(docs.origin, "ada", "admin")])
	await open(page, docs.origin, "/login")
	await expect(page.locator("#session")).toHaveText("Signed in as ada (Administrator)")
})

test("csrf", async ({ http, docs }) => {
	const response = await http.post(`${docs.origin}/_flare/fn/${ECHO}`, {
		headers: { origin: "https://evil.test", "content-type": "application/json" },
		data: { text: "hi" },
	})
	expect(response.status()).toBe(403)
})

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
		})
		call.on("continue", () => call.end(body))
		call.on("response", (response) => {
			response.resume()
			response.on("end", () => resolve(response.statusCode ?? 0))
		})
		call.on("error", reject)
		call.flushHeaders()
	})
}

// The docs server's cap is 64 KiB. The oversized body is 8 MiB, so no loopback buffer absorbs it: on Bun a platform
// cap at the server's limit cut the connection before the 413, which macOS showed and Linux hid at 70 KiB (BUGS.md 114).
test("body limit", async ({ http, docs }) => {
	const url = `${docs.origin}/_flare/fn/${ECHO}`
	const small = await http.post(url, { headers: { origin: docs.origin }, data: { text: "hi" } })
	expect(small.status()).toBe(200)
	expect(await postExpectingContinue(url, docs.origin, JSON.stringify({ text: "x".repeat(8 * 1024 * 1024) }))).toBe(413)
})

// Playwright's API requests share one keep-alive agent per worker process, so a socket a case left idle could carry a
// later case's request just as the server closed it (workerd at 5 s, sending no keep-alive hint), and the request failed
// with ECONNRESET (BUGS.md 125: `body limit` on workers-prod-chromium). The harness's client opens a connection per call
// (http.ts). The counting server resets a second request on a socket that already answered, as an idle close racing a
// send does, so a reused socket fails here every time.
test("request socket per call", async ({ http }) => {
	const answered = new WeakSet<Socket>()
	let connections = 0
	const server = createServer((incoming, response) => {
		if (answered.has(incoming.socket)) {
			incoming.socket.resetAndDestroy()
			return
		}
		answered.add(incoming.socket)
		response.end("ok")
	})
	server.on("connection", () => (connections += 1))
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
	try {
		expect((await http.get(`${origin}/a`)).status()).toBe(200)
		expect((await http.post(`${origin}/b`, { data: { text: "hi" } })).status()).toBe(200)
		expect(connections).toBe(2)
	} finally {
		server.closeAllConnections()
		await new Promise((resolve) => server.close(resolve))
	}
})

// A server that declares no proxy hop ignores a client's own `X-Forwarded-Proto` (dx/adapters.md `trustProxy`, default
// 0): the page over plain http gets no Strict-Transport-Security, on every runtime.
test("forwarded proto untrusted", async ({ http, docs }) => {
	const response = await http.get(`${docs.origin}/`, { headers: { "x-forwarded-proto": "https" } })
	expect(response.status()).toBe(200)
	expect(response.headers()["strict-transport-security"]).toBeUndefined()
})

// B22's canonical path comes from the server's ingress on every runtime, Workers included: `//x` is refused, and an
// empty segment or an upper-case path redirects to the canonical one (dx/adapters.md). A file is the platform's: the
// harness's static layer and Cloudflare's assets answer it before Flare, so these paths are routes. On Workers dev,
// flare()'s target guard refuses `//x` before @cloudflare/vite-plugin would parse it into the host `x` (BUGS.md 118).
test("canonical ingress", async ({ http, docs }) => {
	const raw = { maxRedirects: 0 }
	expect((await http.get(`${docs.origin}//x`, raw)).status()).toBe(400)
	const empty = await http.get(`${docs.origin}/docs//routing`, raw)
	expect([empty.status(), empty.headers()["location"]]).toEqual([301, "/docs/routing"])
	const upper = await http.get(`${docs.origin}/CHANGELOG`, raw)
	expect([upper.status(), upper.headers()["location"]]).toEqual([301, "/changelog"])
})

test("middleware next", async ({ http, docs }) => {
	const response = await http.get(`${docs.origin}/`)
	expect(response.headers()["x-docs-time"]).toMatch(/^\d+ms$/)
})

test("middleware respond", async ({ http, docs }) => {
	const response = await http.get(`${docs.origin}/maintenance`)
	expect(response.status()).toBe(503)
	expect(response.headers()["retry-after"]).toBe("60")
	expect(await response.text()).toBe("Down for maintenance")
	expect(response.headers()["x-content-type-options"]).toBe("nosniff")
})

test("middleware bypass", async ({ http, docs }) => {
	const response = await http.post(`${docs.origin}/_flare/fn/${ECHO}`, {
		headers: { origin: docs.origin, "content-type": "application/json", "x-docs-ping": "1" },
		data: { text: "hi" },
	})
	expect(await response.text()).toBe("pong")
})

test("middleware prefix", async ({ http, docs }) => {
	expect((await http.get(`${docs.origin}/docs/routing`)).headers()["x-docs-section"]).toBe("docs")
	expect((await http.get(`${docs.origin}/`)).headers()["x-docs-section"]).toBeUndefined()
})

test("mount", async ({ http, docs }) => {
	const response = await http.get(`${docs.origin}/healthz/deep?x=1`)
	expect(await response.json()).toEqual({ ok: true, path: "/deep" })
	expect(response.headers()["x-content-type-options"]).toBe("nosniff")
})

test("response route", async ({ http, docs }) => {
	const response = await http.get(`${docs.origin}/llms.txt`)
	expect(response.headers()["content-type"]).toBe("text/plain; charset=utf-8")
	expect(response.headers()["cache-control"]).toBe("public, max-age=300")
	expect(await response.text()).toMatch(/^# Flare docs\n\n- \[Routing\]/)
})

test("route headers", async ({ http, docs }) => {
	expect((await http.get(`${docs.origin}/admin`)).headers()["x-docs-area"]).toBe("admin")
})

test("route security", async ({ http, docs }) => {
	const response = await http.get(`${docs.origin}/admin`)
	expect(response.headers()["x-frame-options"]).toBe("DENY")
	const seen = nonces(response.headers()["content-security-policy"], await response.text())
	expect(seen.body).toEqual([seen.header])
})

test("security defaults", async ({ http, docs }) => {
	const response = await http.get(`${docs.origin}/playground`)
	const headers = response.headers()
	expect(headers["x-content-type-options"]).toBe("nosniff")
	expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin")
	expect(headers["x-frame-options"]).toBe("SAMEORIGIN")
	expect(headers["permissions-policy"]).toContain("camera=()")
	expect(headers["strict-transport-security"]).toBeUndefined()
	const seen = nonces(headers["content-security-policy"], await response.text())
	expect(seen.body).toEqual([seen.header])
})

test("indexnow key file", async ({ http, docs }) => {
	const response = await http.get(`${docs.origin}/${INDEX_NOW_KEY}.txt`)
	expect(response.status()).toBe(200)
	expect(response.headers()["content-type"]).toMatch(/^text\/plain/)
	expect((await response.text()).trim()).toBe(INDEX_NOW_KEY)
})
